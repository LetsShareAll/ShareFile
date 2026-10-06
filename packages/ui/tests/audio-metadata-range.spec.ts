import { afterEach, describe, expect, it, vi } from 'vitest';

import { readAudioMetadata } from '@/features/preview/players/audio/metadata';

const metadataResult = {
  common: { title: '标签标题', artist: '标签艺术家', picture: [] },
  format: {},
  native: {},
};

vi.mock('music-metadata', () => ({
  parseBlob: vi.fn(async () => metadataResult),
  parseWebStream: vi.fn(async () => metadataResult),
  selectCover: vi.fn(() => null),
}));

function responseStub(status = 206): Response {
  return {
    ok: true,
    status,
    headers: new Headers({ 'content-type': 'audio/flac' }),
    body: null,
    blob: async () => new Blob([]),
  } as unknown as Response;
}

function fetchCalls(): RequestInit[] {
  return (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock
    .calls as RequestInit[];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readAudioMetadata 的 Range 限长解析', () => {
  it('给了 maxBytes 时只请求文件头（Range: bytes=0-N）', async () => {
    const fetchMock = vi.fn(async () => responseStub());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await readAudioMetadata(
      'https://cdn.example.com/song.flac',
      undefined,
      { name: 'song' },
      new AbortController().signal,
      { maxBytes: 512 * 1024 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];

    expect(url).toBe('https://cdn.example.com/song.flac');
    expect(new Headers(init.headers).get('range')).toBe('bytes=0-524287');
  });

  it('截断解析失败时回退为整文件请求（不带 Range）', async () => {
    const fetchMock = vi.fn(async () => responseStub());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const musicMetadata = await import('music-metadata');
    const parseBlob = musicMetadata.parseBlob as unknown as ReturnType<
      typeof vi.fn
    >;

    parseBlob.mockRejectedValueOnce(new Error('truncated stream'));

    await readAudioMetadata(
      'https://cdn.example.com/movie.m4a',
      undefined,
      { name: 'movie' },
      new AbortController().signal,
      { maxBytes: 512 * 1024 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchCalls()[1]?.headers).toBeUndefined();
  });

  it('未给 maxBytes 时不带 Range（保持旧行为）', async () => {
    const fetchMock = vi.fn(async () => responseStub(200));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await readAudioMetadata(
      'https://cdn.example.com/song.flac',
      undefined,
      { name: 'song' },
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchCalls()[0]?.headers).toBeUndefined();
  });

  it('中止后不再发起回退请求', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => {
      controller.abort();

      return responseStub();
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const musicMetadata = await import('music-metadata');
    const parseBlob = musicMetadata.parseBlob as unknown as ReturnType<
      typeof vi.fn
    >;

    parseBlob.mockRejectedValueOnce(new Error('truncated stream'));

    await expect(
      readAudioMetadata(
        'https://cdn.example.com/song.flac',
        undefined,
        { name: 'song' },
        controller.signal,
        { maxBytes: 512 * 1024 },
      ),
    ).rejects.toThrow('truncated stream');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

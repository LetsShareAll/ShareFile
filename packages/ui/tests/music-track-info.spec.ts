import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioPreviewMetadata } from '@/features/preview/players/audio/metadata';
import type { MusicTrack } from '@/features/music/track';
import {
  clearTrackInfoCache,
  getCachedTrackInfo,
  parseDurationSeconds,
  parseTrackInfoStore,
  putTrackInfo,
  readTrackInfoCover,
  releaseTrackInfoCovers,
  serializeTrackInfoStore,
  type TrackInfo,
} from '@/features/music/trackInfo';
import { useTrackInfo } from '@/features/music/useTrackInfo';
import { useMusicStore } from '@/stores/music';

const readAudioMetadata = vi.hoisted(() => vi.fn());

vi.mock('@/features/preview/players/audio/metadata', () => ({
  readAudioMetadata,
}));

const parsed: AudioPreviewMetadata = {
  title: '标签标题',
  artist: '标签艺术家',
  duration: '3:07',
  lyrics: [],
  hasCommonTags: true,
};

function track(id: string, size = 100): MusicTrack {
  const name = `${id} - 歌名.flac`;

  return { id, name, path: `/music/${name}`, url: `/music/${id}.flac`, size };
}

beforeEach(() => {
  setActivePinia(createPinia());
  clearTrackInfoCache();
  readAudioMetadata.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('trackInfo 的内容缓存', () => {
  it('命中 / 未命中：同 id 但 size 变了视为失效', () => {
    putTrackInfo({ id: 'a', size: 100, duration: 187, title: '歌名' });

    expect(getCachedTrackInfo('a', 100)?.duration).toBe(187);
    expect(getCachedTrackInfo('a', 100)?.title).toBe('歌名');
    expect(getCachedTrackInfo('a', 101)).toBeUndefined();
    expect(getCachedTrackInfo('missing')).toBeUndefined();
  });

  it('坏 JSON / 结构不符回落空表，坏字段被丢掉', () => {
    expect(parseTrackInfoStore('{oops').size).toBe(0);
    expect(parseTrackInfoStore(null).size).toBe(0);
    expect(parseTrackInfoStore('{"a":1}').size).toBe(0);

    const store = parseTrackInfoStore(
      JSON.stringify([{ id: 1 }, { id: 'ok', duration: 'nope', size: 'big' }]),
    );

    expect([...store.keys()]).toEqual(['ok']);
    expect(store.get('ok')).toEqual({ id: 'ok', updatedAt: '' });
  });

  it('序列化往返一致，且序列化结果不含 coverUrl / blob', () => {
    const entry: TrackInfo & { coverUrl?: string } = {
      id: 'a',
      duration: 187,
      title: '歌名',
      artist: '艺术家',
      size: 42,
      updatedAt: '2024-01-01T00:00:00.000Z',
      coverUrl: 'blob:http://localhost/cover',
    };
    // 运行时字段不进 JSON：读回来的是同一条记录减掉 coverUrl。
    const raw = serializeTrackInfoStore(new Map([['a', entry]]));
    const { coverUrl, ...stored } = entry;

    expect(coverUrl).toBeDefined();
    expect(raw).not.toContain('coverUrl');
    expect(raw).not.toContain('blob');
    expect(parseTrackInfoStore(raw)).toEqual(new Map([['a', stored]]));
  });

  it('封面只进内存：落盘的只剩元信息，回收时 revoke', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');

    putTrackInfo({ id: 'a', size: 1, coverUrl: 'blob:http://localhost/one' });
    putTrackInfo({ id: 'b', size: 1, coverUrl: 'blob:http://localhost/two' });

    expect(readTrackInfoCover('a')).toBe('blob:http://localhost/one');
    expect(window.localStorage.getItem('music-info')).not.toContain('blob');

    releaseTrackInfoCovers(['a']);
    expect(readTrackInfoCover('a')).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/one');
    expect(readTrackInfoCover('b')).toBe('blob:http://localhost/two');
  });

  it('展示时长文本还原成秒', () => {
    expect(parseDurationSeconds('3:07')).toBe(187);
    expect(parseDurationSeconds('1:02:03')).toBe(3723);
    expect(parseDurationSeconds('--:--')).toBeUndefined();
    expect(parseDurationSeconds(undefined)).toBeUndefined();
  });
});

describe('useTrackInfo 的限流与去重', () => {
  it('5 个不同 id 并发：任一时刻在飞数量 ≤ 2', async () => {
    let active = 0;
    let peak = 0;

    readAudioMetadata.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);

      await new Promise(resolve => setTimeout(resolve, 1));

      active -= 1;

      return parsed;
    });

    const { requestTrackInfo } = useTrackInfo();

    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map(id => requestTrackInfo(track(id))),
    );

    expect(peak).toBe(2);
    expect(readAudioMetadata).toHaveBeenCalledTimes(5);
    expect(getCachedTrackInfo('e', 100)?.duration).toBe(187);
  });

  it('同 id 并发只解析一次', async () => {
    readAudioMetadata.mockResolvedValue(parsed);

    const { requestTrackInfo } = useTrackInfo();
    const item = track('same');

    await Promise.all([
      requestTrackInfo(item),
      requestTrackInfo(item),
      requestTrackInfo(item),
    ]);

    expect(readAudioMetadata).toHaveBeenCalledTimes(1);
  });

  it('失败静默：状态记为 error，不抛也不写缓存', async () => {
    readAudioMetadata.mockRejectedValue(new Error('boom'));

    const { getTrackInfo, requestTrackInfo } = useTrackInfo();
    const item = track('bad');

    await expect(requestTrackInfo(item)).resolves.toBeUndefined();
    expect(getTrackInfo(item).status).toBe('error');
    expect(getCachedTrackInfo('bad')).toBeUndefined();
  });

  it('当前曲目复用播放器已解析的元信息，不重复请求', async () => {
    const music = useMusicStore();

    music.queue = [track('now', 555)];
    music.currentIndex = 0;
    music.duration = 187;
    music.metadata = {
      status: 'ready',
      title: '标签标题',
      artist: '标签艺术家',
      coverUrl: 'blob:http://localhost/now',
    };

    const { getTrackInfo, requestTrackInfo } = useTrackInfo();
    const item = track('now', 555);

    await requestTrackInfo(item);

    expect(readAudioMetadata).not.toHaveBeenCalled();

    const view = getTrackInfo(item);

    expect(view.status).toBe('idle');
    expect(view.coverUrl).toBe('blob:http://localhost/now');
    expect(view.duration).toBe(187);
  });

  it('卸载时取消在途请求，并放掉排队的等待者', async () => {
    const aborted: AbortSignal[] = [];

    readAudioMetadata.mockImplementation(
      (_url, _mime, _fallback, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted.push(signal);
            reject(new Error('aborted'));
          });
        }),
    );

    const { requestTrackInfo, dispose } = useTrackInfo();
    const tasks = ['a', 'b', 'c', 'd'].map(id => requestTrackInfo(track(id)));

    dispose();

    await expect(Promise.all(tasks)).resolves.toHaveLength(4);
    expect(aborted).toHaveLength(2);
  });
});

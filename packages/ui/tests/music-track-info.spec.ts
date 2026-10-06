import { createHistoryEntry, toMusicTrack } from '@/features/music/persistence';
import {
  buildQueueFromDirectory,
  parseMusicState,
  serializeMusicState,
} from '@/features/music/track';
import type { ShareNode } from '@/domain/share-file';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioPreviewMetadata } from '@/features/preview/players/audio/metadata';
import type { MusicTrack } from '@/features/music/track';
import {
  clearTrackInfoCache,
  getCachedTrackInfo,
  MAX_COVERS,
  parseTrackInfoStore,
  putTrackInfo,
  readTrackInfoCover,
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

  it('封面只进内存：落盘的只剩元信息，整体回收时 revoke', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');

    putTrackInfo({ id: 'a', size: 1, coverUrl: 'blob:http://localhost/one' });
    putTrackInfo({ id: 'b', size: 1, coverUrl: 'blob:http://localhost/two' });

    expect(readTrackInfoCover('a', 1)).toBe('blob:http://localhost/one');
    expect(window.localStorage.getItem('music-info')).not.toContain('blob');

    clearTrackInfoCache();

    expect(readTrackInfoCover('a', 1)).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/one');
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/two');
  });
});

describe('封面缓存的生命周期（跨挂载 / LRU / size）', () => {
  it('跨挂载存活：卸载后封面仍在，重开面板直接命中、不再解析', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const cover = 'blob:http://localhost/cover-a';

    readAudioMetadata.mockResolvedValue({ ...parsed, coverUrl: cover });

    const first = useTrackInfo();

    await first.requestTrackInfo(track('a'));

    expect(readTrackInfoCover('a', 100)).toBe(cover);

    // 面板卸载 = 收尾 dispose：取消在途请求，但封面归模块级缓存，不跟着一起回收。
    first.dispose();

    expect(revoke).not.toHaveBeenCalled();
    expect(readTrackInfoCover('a', 100)).toBe(cover);

    // 重开面板：命中缓存与封面，一次网络都不再发。
    const second = useTrackInfo();

    await second.requestTrackInfo(track('a'));

    expect(readAudioMetadata).toHaveBeenCalledTimes(1);
    expect(second.getTrackInfo(track('a')).coverUrl).toBe(cover);
  });

  it('LRU 淘汰：超过上限时 revoke 最久未用的那张', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const cover = (index: number): string => `blob:http://localhost/${index}`;

    for (let index = 0; index < MAX_COVERS; index += 1) {
      putTrackInfo({ id: `t${index}`, size: 1, coverUrl: cover(index) });
    }

    // 读命中即刷新 LRU 位置：t0 不再是待淘汰的那张。
    expect(readTrackInfoCover('t0', 1)).toBe(cover(0));

    putTrackInfo({ id: 'extra', size: 1, coverUrl: cover(100) });

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(cover(1));
    expect(readTrackInfoCover('t1', 1)).toBeUndefined();
    expect(readTrackInfoCover('t0', 1)).toBe(cover(0));
    expect(readTrackInfoCover('extra', 1)).toBe(cover(100));
  });

  it('同一 id 的 size 变化：旧封面 revoke，新 size 之外查不到', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const oldCover = 'blob:http://localhost/old';
    const newCover = 'blob:http://localhost/new';

    putTrackInfo({ id: 'a', size: 100, coverUrl: oldCover });

    // 文件被换过：这一轮解析没有封面，旧图也必须作废。
    putTrackInfo({ id: 'a', size: 200, duration: 187 });

    expect(revoke).toHaveBeenCalledWith(oldCover);
    expect(readTrackInfoCover('a', 200)).toBeUndefined();
    expect(readTrackInfoCover('a')).toBeUndefined();

    // 新文件解析出封面：按新 size 命中，旧 size 查不到。
    putTrackInfo({ id: 'a', size: 200, coverUrl: newCover });

    expect(readTrackInfoCover('a', 200)).toBe(newCover);
    expect(readTrackInfoCover('a', 100)).toBeUndefined();
  });
});

describe('当前曲目的时长（metadata.duration 与回退）', () => {
  it('标签解析出的时长写进 metadata，队列当前项直接用它', () => {
    const music = useMusicStore();

    music.queue = [track('now', 555)];
    music.currentIndex = 0;
    // 引擎还没 loadedmetadata：music.duration 仍是 0，过去这里会显示 --:--。
    music.duration = 0;
    music.metadata = { status: 'ready', duration: 187, title: '标签标题' };

    const { getTrackInfo } = useTrackInfo();

    expect(getTrackInfo(track('now', 555)).duration).toBe(187);
  });

  it('metadata 没有时长时回退引擎的 music.duration', () => {
    const music = useMusicStore();

    music.queue = [track('now', 555)];
    music.currentIndex = 0;
    music.duration = 120;
    music.metadata = { status: 'ready', title: '标签标题' };

    const { getTrackInfo } = useTrackInfo();

    expect(getTrackInfo(track('now', 555)).duration).toBe(120);
  });

  it('队列自己解析出的时长优先于 metadata 与引擎', async () => {
    const music = useMusicStore();

    music.queue = [track('a', 555), track('b', 555)];
    music.currentIndex = 0;
    music.duration = 0;
    music.metadata = { status: 'idle' };

    readAudioMetadata.mockResolvedValue(parsed);

    const { getTrackInfo, requestTrackInfo } = useTrackInfo();

    // 队列先解析 b（此时 b 还不是当前曲目）。
    await requestTrackInfo(track('b', 555));

    // b 成为当前曲目，播放器的 metadata 报了另一个时长：队列自己那份仍然优先。
    music.currentIndex = 1;
    music.metadata = { status: 'ready', duration: 60 };

    expect(getTrackInfo(track('b', 555)).duration).toBe(187);
  });

  it('非当前曲目不看 metadata：只认它自己那份解析结果', () => {
    const music = useMusicStore();

    music.queue = [track('other', 555)];
    music.currentIndex = 0;
    music.duration = 120;
    music.metadata = { status: 'ready', duration: 187 };

    const { getTrackInfo } = useTrackInfo();

    expect(getTrackInfo(track('elsewhere', 555)).duration).toBeUndefined();
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

describe('受限曲目（restricted）在队列与历史里的传递', () => {
  it('buildQueueFromDirectory 保留 restricted，非受限曲目不落该字段', () => {
    const nodes = [
      { id: 'a.mp3', name: 'a.mp3', type: 'file', restricted: true },
      { id: 'b.mp3', name: 'b.mp3', type: 'file' },
    ] as unknown as ShareNode[];
    const queue = buildQueueFromDirectory(
      nodes,
      id => `/${id}`,
      node => node.url ?? '',
    );

    expect(queue[0]?.restricted).toBe(true);
    expect(queue[1]).toHaveProperty('restricted', undefined);
  });

  it('历史条目与队列持久化都保留 restricted（回放/刷新后不再给出分享入口）', () => {
    const track = {
      id: 'a.mp3',
      name: 'a.mp3',
      path: '/a.mp3',
      url: 'https://cdn.example.com/a.mp3',
      restricted: true,
    };

    expect(createHistoryEntry(track, new Date(0)).restricted).toBe(true);
    expect(
      toMusicTrack(createHistoryEntry(track, new Date(0))).restricted,
    ).toBe(true);

    const restored = parseMusicState(
      serializeMusicState({
        queue: [track],
        currentIndex: 0,
        mode: 'sequence',
        volume: 0.8,
        currentTime: 0,
      }),
    );

    expect(restored?.queue[0]?.restricted).toBe(true);
  });
});

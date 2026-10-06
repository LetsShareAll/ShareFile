import { getCurrentInstance, onUnmounted, ref } from 'vue';

import { useMusicStore } from '../../stores/music';
import { parseAudioTitle } from '../preview/players/audio/format';
import { readAudioMetadata } from '../preview/players/audio/metadata';
import { parseDurationSeconds, type MusicTrack } from './track';
import {
  getCachedTrackInfo,
  putTrackInfo,
  readTrackInfoCover,
  trackInfoKey,
} from './trackInfo';

export interface TrackInfoView {
  status: 'idle' | 'loading' | 'ready' | 'error';
  duration?: number;
  title?: string;
  artist?: string;
  /** 现读模块级封面缓存得到；可能已被 LRU 淘汰。 */
  coverUrl?: string;
}

/** 视图状态不持有 ObjectURL：封面的生命周期只属于模块级缓存。 */
type TrackInfoEntry = Omit<TrackInfoView, 'coverUrl'>;

/** 38–56 MB 的音频整文件解析要几分钟；时长在文件头，512 KB 足够。 */
const MAX_BYTES = 512 * 1024;
/** 并发上限：再多只会互相抢带宽，还会拖慢正在播放的那一首。 */
const MAX_CONCURRENT = 2;

interface WaitingTask {
  track: MusicTrack;
  key: string;
  resolve: () => void;
}

const IDLE: TrackInfoEntry = { status: 'idle' };

/**
 * 队列项的懒解析：只在用得上时才发请求，同 id 去重、最多两个在飞，
 * 失败只落在自己的状态里，绝不打断播放。
 */
export function useTrackInfo() {
  const music = useMusicStore();
  const views = ref<Record<string, TrackInfoEntry>>({});
  const controllers = new Map<string, AbortController>();
  const handled = new Set<string>();
  const pending = new Map<string, Promise<void>>();
  const waiting: WaitingTask[] = [];
  let disposed = false;

  function setView(id: string, view: TrackInfoEntry): void {
    views.value = { ...views.value, [id]: view };
  }

  /** 当前曲目已被播放器解析过：复用它的封面，不再发第二次请求。 */
  function canReuse(id: string): boolean {
    if (music.currentTrack?.id !== id) return false;

    return (
      music.metadata.status === 'ready' || music.metadata.status === 'loading'
    );
  }

  /** 当前曲目的时长：标签解析值优先（面板一打开就有），引擎的 loadedmetadata 兜底。 */
  function currentDuration(): number | undefined {
    return (
      music.metadata.duration ??
      (music.duration > 0 ? music.duration : undefined)
    );
  }

  function getTrackInfo(track: MusicTrack): TrackInfoView {
    const view = views.value[track.id] ?? IDLE;
    const current = music.currentTrack?.id === track.id;
    // 封面现读缓存（顺带刷新 LRU）：淘汰过的图不会以已 revoke 的 src 留在视图里。
    const coverUrl =
      readTrackInfoCover(track.id, track.size) ??
      (current ? music.metadata.coverUrl : undefined);
    const duration = view.duration ?? (current ? currentDuration() : undefined);

    return { ...view, duration, coverUrl };
  }

  function pump(): void {
    if (disposed) return;

    while (controllers.size < MAX_CONCURRENT && waiting.length > 0) {
      const task = waiting.shift();

      if (task) void run(task);
    }
  }

  async function run(task: WaitingTask): Promise<void> {
    const { track, key, resolve } = task;
    const cached = getCachedTrackInfo(track.id, track.size);
    const controller = new AbortController();

    controllers.set(key, controller);
    setView(track.id, {
      status: 'loading',
      duration: cached?.duration,
      title: cached?.title,
      artist: cached?.artist,
    });

    try {
      const info = await readAudioMetadata(
        track.url,
        undefined,
        parseAudioTitle(track.name),
        controller.signal,
        { maxBytes: MAX_BYTES },
      );

      if (controller.signal.aborted) {
        // 卸载后拿到的封面没人接，自己回收。
        if (info.coverUrl) URL.revokeObjectURL(info.coverUrl);

        return;
      }

      const stored = putTrackInfo({
        id: track.id,
        size: track.size,
        duration: parseDurationSeconds(info.duration),
        title: info.title,
        artist: info.artist,
        coverUrl: info.coverUrl,
      });

      setView(track.id, {
        status: 'ready',
        duration: stored.duration,
        title: stored.title,
        artist: stored.artist,
      });
    } catch {
      // 失败静默：这一项停在占位文案上，不影响别的曲目与播放。
      if (!controller.signal.aborted) {
        setView(track.id, {
          status: 'error',
          duration: cached?.duration,
          title: cached?.title,
          artist: cached?.artist,
        });
      }
    } finally {
      controllers.delete(key);
      pending.delete(key);
      resolve();
      pump();
    }
  }

  function enqueue(track: MusicTrack, key: string): Promise<void> {
    const promise = new Promise<void>(resolve => {
      waiting.push({ track, key, resolve });
    });

    pending.set(key, promise);
    handled.add(key);
    pump();

    return promise;
  }

  /**
   * 请求一项的标签信息。同 id 并发共用一个在途 promise；
   * 已缓存 / 已由播放器解析过的直接返回，不起请求。
   */
  function requestTrackInfo(track: MusicTrack): Promise<void> {
    const key = trackInfoKey(track.id, track.size);
    const started = pending.get(key);

    if (started) return started;
    if (handled.has(key)) return Promise.resolve();

    const cached = getCachedTrackInfo(track.id, track.size);
    const coverUrl = readTrackInfoCover(track.id, track.size);

    if (cached) {
      handled.add(key);
      setView(track.id, {
        status: 'ready',
        duration: cached.duration,
        title: cached.title,
        artist: cached.artist,
      });

      // 封面还在内存里就到此为止；不在的话还得解析一次把它取回来。
      if (coverUrl) return Promise.resolve();
    }

    if (canReuse(track.id) || disposed) return Promise.resolve();

    return enqueue(track, key);
  }

  /** 卸载：取消在途请求；封面缓存是模块级的，跨挂载存活，不在这里回收。 */
  function dispose(): void {
    disposed = true;

    for (const controller of controllers.values()) controller.abort();

    controllers.clear();

    for (const task of waiting.splice(0)) {
      pending.delete(task.key);
      task.resolve();
    }
  }

  // 组件里用时自己收尾：卸载即取消在途请求（封面的生命周期归模块级缓存管）。
  if (getCurrentInstance()) onUnmounted(dispose);

  return { getTrackInfo, requestTrackInfo, dispose };
}

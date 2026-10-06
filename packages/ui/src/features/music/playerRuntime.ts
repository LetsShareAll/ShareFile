import { parseAudioTitle } from '../preview/players/audio/format';
import { readAudioMetadata } from '../preview/players/audio/metadata';
import { parseDurationSeconds, type MusicTrack } from './track';

export interface EngineSong {
  name: string;
  artist?: string;
  url: string;
}

/** amplitudejs 只用播放核心，不碰依赖 DOM 的按钮 / 滑块 API。 */
export interface MusicEngine {
  init(config: {
    songs: EngineSong[];
    preload: string;
    continue_next: boolean;
  }): void;
  play(): void;
  pause(): void;
  playSongAtIndex(index: number): void;
  setVolume(level: number): void;
  getAudio(): HTMLAudioElement;
}

/** 懒加载的内嵌元信息状态机。 */
export interface MusicMetadataState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** 标签里的总时长（秒）：比引擎的 loadedmetadata 先到，面板 / 悬浮卡先用它。 */
  duration?: number;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  lyrics?: { time: number; text: string }[];
}

export interface PlayerRuntimeHandlers {
  onTime(seconds: number): void;
  onDuration(seconds: number): void;
  onPlayState(playing: boolean): void;
  onEnded(): void;
  onError(): void;
  onMetadata(state: MusicMetadataState): void;
}

export interface PlayerRuntime {
  start(
    tracks: readonly MusicTrack[],
    index: number,
    volume: number,
  ): Promise<boolean>;
  hasQueue(tracks: readonly MusicTrack[]): boolean;
  resume(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(level: number): void;
  release(): void;
  loadMetadata(track: MusicTrack | null): void;
}

function toSong(track: MusicTrack): EngineSong {
  const parsed = parseAudioTitle(track.name);

  return { name: parsed.name, artist: parsed.artist, url: track.url };
}

function getQueueKey(tracks: readonly MusicTrack[]): string {
  return tracks.map(track => `${track.id}\u0001${track.url}`).join('\u0000');
}

function revokeCover(url: string | undefined): void {
  if (url) URL.revokeObjectURL(url);
}

/** 解析内嵌元信息：失败只返回错误态，不影响播放。 */
async function readTrackMetadata(
  track: MusicTrack,
  signal: AbortSignal,
): Promise<MusicMetadataState> {
  try {
    const info = await readAudioMetadata(
      track.url,
      undefined,
      parseAudioTitle(track.name),
      signal,
      // 38–56 MB 的音频在慢速 CDN 上整文件解析要几分钟，先取头部 512 KB。
      { maxBytes: 512 * 1024 },
    );

    if (signal.aborted) {
      revokeCover(info.coverUrl);

      return { status: 'idle' };
    }

    return {
      status: 'ready',
      duration: parseDurationSeconds(info.duration),
      title: info.title,
      artist: info.artist,
      album: info.album,
      coverUrl: info.coverUrl,
      lyrics: info.lyrics.map(line => ({ time: line.time, text: line.lyric })),
    };
  } catch {
    return signal.aborted ? { status: 'idle' } : { status: 'error' };
  }
}

export function createPlayerRuntime(
  handlers: PlayerRuntimeHandlers,
): PlayerRuntime {
  let engine: MusicEngine | null = null;
  let queueKey = '';
  let bound: { audio: HTMLAudioElement; handler: EventListener } | null = null;
  let controller: AbortController | null = null;
  let coverUrl: string | undefined;
  let loadedTrackId: string | null = null;

  function audioElement(): HTMLAudioElement | null {
    return engine?.getAudio() ?? null;
  }

  async function loadEngine(): Promise<MusicEngine | null> {
    if (engine) return engine;

    try {
      const module = await import('amplitudejs');

      engine = module.default as unknown as MusicEngine;
    } catch {
      // 引擎不可用时由调用方提示。
    }

    return engine;
  }

  function bindEvents(): void {
    const audio = audioElement();

    if (!audio || audio === bound?.audio) return;

    if (bound) {
      for (const type of events) {
        bound.audio.removeEventListener(type, bound.handler);
      }
    }

    const handler: EventListener = event => dispatch[event.type]?.();

    for (const type of events) audio.addEventListener(type, handler);

    bound = { audio, handler };
  }

  function stopAudio(): void {
    const audio = audioElement();

    if (!audio) return;

    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  function syncQueue(
    current: MusicEngine,
    tracks: readonly MusicTrack[],
    level: number,
  ): void {
    const key = getQueueKey(tracks);

    if (key === queueKey) return;

    // 旧元素先停掉，避免重新 init 后旧音频继续出声。
    stopAudio();
    current.init({
      songs: tracks.map(toSong),
      preload: 'metadata',
      continue_next: false,
    });
    queueKey = key;
    current.setVolume(level * 100);
  }

  async function start(
    tracks: readonly MusicTrack[],
    index: number,
    level: number,
  ): Promise<boolean> {
    const current = await loadEngine();

    if (!current) return false;

    try {
      syncQueue(current, tracks, level);
      bindEvents();
      current.playSongAtIndex(index);
    } catch {
      // 引擎初始化异常由调用方提示，不向上抛。
      return false;
    }

    return true;
  }

  function hasQueue(tracks: readonly MusicTrack[]): boolean {
    return engine !== null && queueKey === getQueueKey(tracks);
  }

  function loadMetadata(track: MusicTrack | null): void {
    controller?.abort();
    controller = null;
    revokeCover(coverUrl);
    coverUrl = undefined;

    if (!track) {
      loadedTrackId = null;
      handlers.onMetadata({ status: 'idle' });

      return;
    }

    if (loadedTrackId === track.id) return;

    loadedTrackId = track.id;

    const request = new AbortController();

    controller = request;
    const parsedName = parseAudioTitle(track.name);

    // 标签要等网络，先用文件名解析结果撑住标题与艺术家（立即有意义的文案）。
    handlers.onMetadata({
      status: 'loading',
      title: parsedName.name,
      artist: parsedName.artist,
    });

    void readTrackMetadata(track, request.signal).then(state => {
      if (request.signal.aborted) return;

      coverUrl = state.coverUrl;
      handlers.onMetadata(state);
    });
  }

  function release(): void {
    controller?.abort();
    controller = null;
    loadedTrackId = null;
    revokeCover(coverUrl);
    coverUrl = undefined;
    handlers.onMetadata({ status: 'idle' });
    stopAudio();
    queueKey = '';
  }

  const readTime = (): number => {
    const audio = audioElement();

    return audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  };

  const readDuration = (): number => {
    const value = audioElement()?.duration ?? 0;

    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  const dispatch: Record<string, () => void> = {
    timeupdate: () => handlers.onTime(readTime()),
    durationchange: () => handlers.onDuration(readDuration()),
    loadedmetadata: () => handlers.onDuration(readDuration()),
    play: () => handlers.onPlayState(true),
    pause: () => handlers.onPlayState(false),
    ended: handlers.onEnded,
    error: handlers.onError,
  };

  const events = Object.keys(dispatch);

  return {
    start,
    hasQueue,
    resume: () => engine?.play(),
    pause: () => engine?.pause(),
    seek: seconds => {
      const audio = audioElement();

      if (audio) audio.currentTime = seconds;
    },
    setVolume: level => engine?.setVolume(level * 100),
    release,
    loadMetadata,
  };
}

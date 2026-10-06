import { parseAudioTitle } from '../preview/players/audio/format';

export interface MediaSessionInfo {
  title: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
}

export interface MediaSessionHandlers {
  play(): void;
  pause(): void;
  previousTrack(): void;
  nextTrack(): void;
  seekTo(seconds: number): void;
}

/** 浏览器不支持 Media Session API 时返回 null，调用方全部静默跳过。 */
function getSession(): MediaSession | null {
  if (typeof navigator === 'undefined') return null;

  return navigator.mediaSession ?? null;
}

export function setMediaSessionTrack(info: MediaSessionInfo | null): void {
  const session = getSession();

  if (!session) return;

  const Metadata = globalThis.MediaMetadata;

  session.metadata =
    info && typeof Metadata === 'function'
      ? new Metadata({
          title: info.title,
          artist: info.artist,
          album: info.album,
          artwork: info.coverUrl ? [{ src: info.coverUrl }] : [],
        })
      : null;
}

/** 用当前曲目 + 已解析元信息刷新系统媒体信息（标题 / 艺术家 / 专辑 / 封面）。 */
export function syncMediaSessionTrack(
  track: { name: string } | null,
  info: {
    title?: string;
    artist?: string;
    album?: string;
    coverUrl?: string;
  } | null,
): void {
  if (!track) {
    setMediaSessionTrack(null);

    return;
  }

  const parsed = parseAudioTitle(track.name);

  setMediaSessionTrack({
    title: info?.title || parsed.name || track.name,
    artist: info?.artist || parsed.artist,
    album: info?.album,
    coverUrl: info?.coverUrl,
  });
}

export function setMediaSessionHandlers(handlers: MediaSessionHandlers): void {
  const session = getSession();

  if (!session) return;

  const actions: readonly [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => handlers.play()],
    ['pause', () => handlers.pause()],
    ['previoustrack', () => handlers.previousTrack()],
    ['nexttrack', () => handlers.nextTrack()],
    [
      'seekto',
      details => {
        if (typeof details.seekTime === 'number') {
          handlers.seekTo(details.seekTime);
        }
      },
    ],
  ];

  for (const [action, handler] of actions) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // 浏览器不支持该动作（如某些平台没有 seekto）时忽略。
    }
  }
}

/** 播放中周期性同步播放进度；duration 未知或非法时跳过。 */
export function setMediaSessionPosition(
  duration: number,
  position: number,
  rate = 1,
): void {
  const session = getSession();

  if (!session || !Number.isFinite(duration) || duration <= 0) return;

  try {
    session.setPositionState({
      duration,
      position: Math.min(Math.max(0, position), duration),
      playbackRate: rate > 0 ? rate : 1,
    });
  } catch {
    // 未实现或参数被拒绝时忽略。
  }
}

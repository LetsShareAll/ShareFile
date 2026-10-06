import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  setMediaSessionHandlers,
  setMediaSessionPosition,
  setMediaSessionTrack,
  syncMediaSessionTrack,
} from '@/features/music/mediaSession';

interface StubSession {
  metadata: unknown;
  handlers: Map<string, (details: MediaSessionActionDetails) => void>;
  positions: unknown[];
}

function stubMediaSession(withMetadata = true): StubSession {
  const stub: StubSession = {
    metadata: null,
    handlers: new Map(),
    positions: [],
  };
  const session = {
    get metadata(): unknown {
      return stub.metadata;
    },
    set metadata(value: unknown) {
      stub.metadata = value;
    },
    setActionHandler: (
      action: string,
      handler: (details: MediaSessionActionDetails) => void,
    ): void => {
      stub.handlers.set(action, handler);
    },
    setPositionState: (state?: unknown): void => {
      stub.positions.push(state);
    },
  };

  vi.stubGlobal('navigator', { mediaSession: session });

  if (withMetadata) {
    class FakeMediaMetadata {
      constructor(init: Record<string, unknown>) {
        Object.assign(this, init);
      }
    }

    vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
  }

  return stub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Media Session', () => {
  it('支持时写入标题 / 艺术家 / 专辑 / 封面与动作', () => {
    const session = stubMediaSession();
    const handlers = {
      play: vi.fn(),
      pause: vi.fn(),
      previousTrack: vi.fn(),
      nextTrack: vi.fn(),
      seekTo: vi.fn(),
    };

    syncMediaSessionTrack(
      { name: '艺术家 - 歌曲.mp3' },
      { title: '歌曲', album: '专辑', coverUrl: 'blob:cover' },
    );
    setMediaSessionHandlers(handlers);

    expect(session.metadata).toMatchObject({
      title: '歌曲',
      artist: '艺术家',
      album: '专辑',
      artwork: [{ src: 'blob:cover' }],
    });
    expect([...session.handlers.keys()]).toEqual([
      'play',
      'pause',
      'previoustrack',
      'nexttrack',
      'seekto',
    ]);

    session.handlers.get('nexttrack')?.({ action: 'nexttrack' });
    session.handlers.get('seekto')?.({ action: 'seekto', seekTime: 12 });

    expect(handlers.nextTrack).toHaveBeenCalledOnce();
    expect(handlers.seekTo).toHaveBeenCalledWith(12);
  });

  it('没有元信息时回落到文件名，清空时写 null', () => {
    const session = stubMediaSession();

    syncMediaSessionTrack({ name: '01. 曲目.mp3' }, null);

    expect(session.metadata).toMatchObject({ title: '01. 曲目' });

    setMediaSessionTrack(null);

    expect(session.metadata).toBeNull();
  });

  it('positionState 只在时长有效时写入并夹取进度', () => {
    const session = stubMediaSession();

    setMediaSessionPosition(0, 5);
    setMediaSessionPosition(Number.NaN, 5);

    expect(session.positions).toEqual([]);

    setMediaSessionPosition(100, 250);

    expect(session.positions).toEqual([
      { duration: 100, position: 100, playbackRate: 1 },
    ]);
  });

  it('API 不存在时全部静默跳过', () => {
    vi.stubGlobal('navigator', {});

    expect(() => {
      setMediaSessionTrack({ title: 'x' });
      setMediaSessionHandlers({
        play: () => undefined,
        pause: () => undefined,
        previousTrack: () => undefined,
        nextTrack: () => undefined,
        seekTo: () => undefined,
      });
      setMediaSessionPosition(100, 10);
    }).not.toThrow();
  });
});

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MusicMessage } from '@/features/music/broadcast';
import {
  parseMusicState,
  serializeMusicState,
  type MusicState,
  type MusicTrack,
} from '@/features/music/track';
import { useMusicStore } from '@/stores/music';

const fake = vi.hoisted(() => {
  class FakeAudio extends EventTarget {
    currentTime = 0;
    duration = 0;
    paused = true;
    src = '';

    pause(): void {
      this.paused = true;
    }

    load(): void {}

    removeAttribute(name: string): void {
      if (name === 'src') this.src = '';
    }

    emit(type: string): void {
      this.dispatchEvent(new Event(type));
    }
  }

  const state = {
    audio: new FakeAudio(),
    init: 0,
    play: 0,
    pause: 0,
    indexes: [] as number[],
    volumes: [] as number[],
  };

  return {
    state,
    reset(): void {
      state.audio = new FakeAudio();
      state.init = 0;
      state.play = 0;
      state.pause = 0;
      state.indexes = [];
      state.volumes = [];
    },
    amplitude: {
      init: (): void => {
        state.init += 1;
      },
      getAudio: (): FakeAudio => state.audio,
      play: (): void => {
        state.play += 1;
        state.audio.paused = false;
      },
      pause: (): void => {
        state.pause += 1;
        state.audio.paused = true;
      },
      playSongAtIndex: (index: number): void => {
        state.indexes.push(index);
        state.audio.paused = false;
      },
      setVolume: (level: number): void => {
        state.volumes.push(level);
      },
    },
  };
});

vi.mock('amplitudejs', () => ({ default: fake.amplitude }));

/**
 * 假通道：默认不接线，各用例的 store 互不串台；
 * 需要扮演「另一个标签页」时注入一份，用 deliver() 灌消息、用 sent 看本页广播。
 */
const channel = vi.hoisted(() => {
  class FakeTransport {
    handler: ((data: unknown) => void) | null = null;
    sent: string[] = [];
    /** 打开后 post 会立刻回送给自己，用来验证「忽略自身消息」。 */
    echo = false;

    post(data: string): void {
      this.sent.push(data);

      if (this.echo) this.handler?.(data);
    }

    subscribe(handler: (data: unknown) => void): () => void {
      this.handler = handler;

      return () => {
        this.handler = null;
      };
    }

    close(): void {
      this.handler = null;
    }

    deliver(message: unknown): void {
      this.handler?.(JSON.stringify(message));
    }
  }

  return {
    FakeTransport,
    holder: { current: null as InstanceType<typeof FakeTransport> | null },
  };
});

vi.mock('@/features/music/broadcast', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/features/music/broadcast')>();

  return { ...actual, createBroadcastTransport: () => channel.holder.current };
});
vi.mock('@/features/preview/players/audio/metadata', () => ({
  readAudioMetadata: async () => ({
    title: '解析标题',
    artist: '解析艺术家',
    album: '解析专辑',
    lyrics: [{ time: 1, lyric: '第一行' }],
    coverUrl: undefined,
  }),
}));

function track(id: string): MusicTrack {
  return { id, name: `${id}.mp3`, path: `/${id}.mp3`, url: `/cdn/${id}.mp3` };
}

function ids(tracks: readonly MusicTrack[]): string[] {
  return tracks.map(item => item.id);
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  window.localStorage.clear();
  fake.reset();
  channel.holder.current = null;
  setActivePinia(createPinia());
});

describe('队列与播放', () => {
  it('playTracks 建队并从 startId 开始播放', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b'), track('c')], 'b');

    expect(ids(music.queue)).toEqual(['a', 'b', 'c']);
    expect(music.currentIndex).toBe(1);
    expect(music.currentTrack?.id).toBe('b');
    expect(music.isPlaying).toBe(true);
    expect(fake.state.init).toBe(1);
    expect(fake.state.indexes).toEqual([1]);
  });

  it('同队列切歌复用引擎，只有队列变化才 init', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b')], 'a');
    await music.playTracks([track('a'), track('b')], 'b');

    expect(fake.state.init).toBe(1);
    expect(fake.state.indexes).toEqual([0, 1]);
    expect(music.currentIndex).toBe(1);
  });

  it('playTrack 不带队列时只播这一首', async () => {
    const music = useMusicStore();

    await music.playTrack(track('solo'));

    expect(ids(music.queue)).toEqual(['solo']);
    expect(music.currentIndex).toBe(0);
  });

  it('playTrack 带队列时替换队列并定位到该曲目', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a')]);
    await music.playTrack(track('b'), [track('a'), track('b'), track('c')]);

    expect(ids(music.queue)).toEqual(['a', 'b', 'c']);
    expect(music.currentIndex).toBe(1);
    expect(fake.state.init).toBe(2);
  });

  it('enqueue 加队尾、enqueueNext 插到当前曲目之后', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('c')], 'a');
    music.enqueue(track('d'));
    music.enqueueNext(track('b'));

    expect(ids(music.queue)).toEqual(['a', 'b', 'c', 'd']);
    expect(music.currentIndex).toBe(0);
  });

  it('无当前曲目时 enqueueNext 插到队首', () => {
    const music = useMusicStore();

    music.enqueue(track('a'));
    music.enqueueNext(track('b'));

    expect(ids(music.queue)).toEqual(['b', 'a']);
  });
});

describe('removeFromQueue', () => {
  it('删除当前曲目：停播并指向顶上来的下一首', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b'), track('c')], 'b');
    music.removeFromQueue('b');

    expect(ids(music.queue)).toEqual(['a', 'c']);
    expect(music.currentIndex).toBe(1);
    expect(music.currentTrack?.id).toBe('c');
    expect(music.isPlaying).toBe(false);
    expect(fake.state.pause).toBeGreaterThan(0);
  });

  it('删除更靠前的曲目：下标前移，播放不受影响', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b'), track('c')], 'c');
    music.removeFromQueue('a');

    expect(music.currentIndex).toBe(1);
    expect(music.currentTrack?.id).toBe('c');
    expect(music.isPlaying).toBe(true);
  });

  it('删除最后一首：清空队列与下标', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a')]);
    music.removeFromQueue('a');

    expect(music.queue).toEqual([]);
    expect(music.currentIndex).toBe(-1);
    expect(music.isPlaying).toBe(false);
  });

  it('删除不存在的曲目时不做任何事', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a')]);
    music.removeFromQueue('missing');

    expect(ids(music.queue)).toEqual(['a']);
    expect(music.currentIndex).toBe(0);
  });
});

describe('toggle / seek / clearQueue', () => {
  it('toggle 暂停与续播，同一首不重新切歌', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a')]);
    await music.toggle();

    expect(music.isPlaying).toBe(false);
    expect(fake.state.pause).toBe(1);

    await music.toggle();

    expect(music.isPlaying).toBe(true);
    expect(fake.state.play).toBe(1);
    expect(fake.state.indexes).toEqual([0]);
  });

  it('seek 写入播放进度与音频元素', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a')]);
    music.seek(30);

    expect(music.currentTime).toBe(30);
    expect(fake.state.audio.currentTime).toBe(30);
  });

  it('clearQueue 停止播放并清空', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a')]);
    music.clearQueue();

    expect(music.queue).toEqual([]);
    expect(music.currentIndex).toBe(-1);
    expect(music.currentTrack).toBeNull();
    expect(music.isPlaying).toBe(false);
    expect(fake.state.audio.paused).toBe(true);
    expect(fake.state.audio.src).toBe('');
  });
});

describe('播放模式与结束行为', () => {
  it('timeupdate / loadedmetadata 同步进度与时长', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a')]);
    fake.state.audio.duration = 200;
    fake.state.audio.emit('loadedmetadata');
    fake.state.audio.currentTime = 12.5;
    fake.state.audio.emit('timeupdate');

    expect(music.duration).toBe(200);
    expect(music.currentTime).toBe(12.5);
  });

  it('sequence 非队尾结束后自动下一首', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b')], 'a');
    fake.state.audio.emit('ended');
    await settle();

    expect(music.currentIndex).toBe(1);
    expect(fake.state.indexes).toEqual([0, 1]);
  });

  it('sequence 队尾结束后停住', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b')], 'b');
    fake.state.audio.emit('ended');
    await settle();

    expect(music.isPlaying).toBe(false);
    expect(music.currentIndex).toBe(1);
    expect(fake.state.indexes).toEqual([1]);
  });

  it('loop-all 队尾接队首，loop-one 重复当前曲目', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b')], 'b');
    music.setMode('loop-all');
    fake.state.audio.emit('ended');
    await settle();

    expect(music.currentIndex).toBe(0);

    music.setMode('loop-one');
    fake.state.audio.emit('ended');
    await settle();

    expect(music.currentIndex).toBe(0);
    expect(fake.state.indexes).toEqual([1, 0, 0]);
  });

  it('next / prev 按模式换曲', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b'), track('c')], 'b');
    music.next();
    await settle();

    expect(music.currentIndex).toBe(2);

    music.prev();
    await settle();

    expect(music.currentIndex).toBe(1);
  });

  it('sequence 队首 prev 回到当前曲目开头', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b')], 'a');
    fake.state.audio.currentTime = 20;
    music.prev();

    expect(music.currentTime).toBe(0);
    expect(fake.state.audio.currentTime).toBe(0);
    expect(music.currentIndex).toBe(0);
  });

  it('单曲出错尝试下一首，全部失败后停下并保留错误', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b')], 'a');
    fake.state.audio.emit('error');
    await settle();

    expect(music.currentIndex).toBe(1);

    fake.state.audio.emit('error');
    await settle();

    expect(music.isPlaying).toBe(false);
    expect(music.error).toContain('b');
  });
});

describe('持久化与历史', () => {
  it('hydrate 恢复队列 / 模式 / 音量 / 进度但保持暂停', () => {
    const saved: MusicState = {
      queue: [track('a'), track('b')],
      currentIndex: 1,
      mode: 'loop-all',
      volume: 0.25,
      currentTime: 42,
    };

    window.localStorage.setItem('music', serializeMusicState(saved));

    const music = useMusicStore();

    music.hydrate();

    expect(ids(music.queue)).toEqual(['a', 'b']);
    expect(music.currentIndex).toBe(1);
    expect(music.mode).toBe('loop-all');
    expect(music.volume).toBe(0.25);
    expect(music.currentTime).toBe(42);
    expect(music.isPlaying).toBe(false);
    expect(fake.state.init).toBe(0);
    expect(fake.state.indexes).toEqual([]);
  });

  it('恢复后首次播放从恢复的进度续播', async () => {
    window.localStorage.setItem(
      'music',
      JSON.stringify({
        queue: [track('a')],
        currentIndex: 0,
        mode: 'sequence',
        volume: 0.8,
        currentTime: 42,
      }),
    );

    const music = useMusicStore();

    music.hydrate();
    await music.toggle();

    expect(fake.state.indexes).toEqual([0]);
    expect(fake.state.audio.currentTime).toBe(42);
    expect(music.currentTime).toBe(42);
  });

  it('setMode / setVolume 持久化到 localStorage', async () => {
    const music = useMusicStore();

    music.setMode('shuffle');
    music.setVolume(0.4);
    await settle();

    const saved = parseMusicState(window.localStorage.getItem('music'));

    expect(saved?.mode).toBe('shuffle');
    expect(saved?.volume).toBe(0.4);
  });

  it('setVolume 夹取到 0..1 并同步引擎', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a')]);
    music.setVolume(2);
    expect(music.volume).toBe(1);
    music.setVolume(-1);
    expect(music.volume).toBe(0);
    expect(fake.state.volumes).toEqual([80, 100, 0]);
  });

  it('历史最新在前并按 id 去重', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a')]);
    await music.playTracks([track('b')]);
    await music.playTracks([track('c')]);
    await music.playTracks([track('a')]);

    expect(music.history.map(entry => entry.id)).toEqual(['a', 'c', 'b']);
    expect(music.history[0].playedAt).toBeTruthy();
  });

  it('历史最多保留 50 条', async () => {
    const older = Array.from({ length: 50 }, (_, index) => ({
      id: `old-${index}`,
      name: `${index}.mp3`,
      path: `/${index}.mp3`,
      url: `/cdn/${index}.mp3`,
      playedAt: '2026-01-01T00:00:00.000Z',
    }));

    window.localStorage.setItem('music-history', JSON.stringify(older));

    const music = useMusicStore();

    music.hydrate();

    expect(music.history).toHaveLength(50);

    await music.playTracks([track('newest')]);

    expect(music.history).toHaveLength(50);
    expect(music.history[0].id).toBe('newest');
  });

  it('playFromHistory 把历史项插到队首并播放', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b')], 'b');
    await music.playFromHistory(music.history[0]);

    expect(ids(music.queue)).toEqual(['b', 'a']);
    expect(music.currentIndex).toBe(0);
  });

  it('切歌后懒加载元信息', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a')]);
    await settle();

    expect(music.metadata.status).toBe('ready');
    expect(music.metadata.title).toBe('解析标题');
    expect(music.metadata.album).toBe('解析专辑');
    expect(music.metadata.lyrics).toEqual([{ time: 1, text: '第一行' }]);
  });
});

describe('跨标签页协调', () => {
  function remoteState(targetId?: string): void {
    channel.holder.current?.deliver({
      type: 'state',
      senderId: 'other-tab',
      targetId,
      state: {
        queue: [track('x'), track('y')],
        currentIndex: 1,
        mode: 'loop-all',
        volume: 0.3,
        currentTime: 12,
        duration: 120,
        isPlaying: true,
      },
    });
  }

  it('远端 state 只镜像：同曲同进度，但本页不出声', async () => {
    channel.holder.current = new channel.FakeTransport();

    const music = useMusicStore();

    await music.playTracks([track('a'), track('b')]);

    remoteState();

    expect(ids(music.queue)).toEqual(['x', 'y']);
    expect(music.currentTrack?.id).toBe('y');
    expect(music.mode).toBe('loop-all');
    expect(music.volume).toBe(0.3);
    expect(music.currentTime).toBe(12);
    expect(music.isPlaying).toBe(false);
    expect(fake.state.indexes).toEqual([0]);
    expect(fake.state.play).toBe(0);
    expect(fake.state.pause).toBe(1);

    // 本页之后手动起播，从镜像到的进度接上。
    await music.toggle();

    expect(music.isPlaying).toBe(true);
    expect(fake.state.audio.currentTime).toBe(12);
  });

  it('新标签页 hydrate 广播的暂停态不会掐掉本页播放', async () => {
    const remote = new channel.FakeTransport();

    channel.holder.current = remote;

    const music = useMusicStore();

    await music.playTracks([track('a')]);

    // 新标签页恢复本地存档后会广播自己那份暂停态快照。
    remote.deliver({
      type: 'state',
      senderId: 'other-tab',
      state: {
        queue: [track('a')],
        currentIndex: 0,
        mode: 'sequence',
        volume: 0.8,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
      },
    });

    expect(music.isPlaying).toBe(true);
    expect(music.currentTime).toBe(0);
  });

  it('远端 action: toggle 不会让本页出声', async () => {
    const remote = new channel.FakeTransport();

    channel.holder.current = remote;

    const music = useMusicStore();

    await music.playTracks([track('a')]);

    remote.deliver({
      type: 'action',
      senderId: 'other-tab',
      action: 'toggle',
    });

    expect(music.isPlaying).toBe(false);
    expect(fake.state.play).toBe(0);
    expect(fake.state.indexes).toEqual([0]);
  });

  it('hydrate 发 hello，定向回包按快照对齐', () => {
    const remote = new channel.FakeTransport();

    channel.holder.current = remote;

    const music = useMusicStore();

    music.hydrate();

    expect(remote.sent).toHaveLength(1);

    const hello = JSON.parse(remote.sent[0]) as MusicMessage;

    expect(hello.type).toBe('hello');

    remote.deliver({
      type: 'state',
      senderId: 'other-tab',
      targetId: hello.senderId,
      state: {
        queue: [track('b')],
        currentIndex: 0,
        mode: 'shuffle',
        volume: 0.5,
        currentTime: 9,
        duration: 90,
        isPlaying: true,
      },
    });

    expect(ids(music.queue)).toEqual(['b']);
    expect(music.mode).toBe('shuffle');
    expect(music.currentTime).toBe(9);
    expect(music.isPlaying).toBe(false);
  });

  it('定向给别的标签页的 state 不落地', async () => {
    const remote = new channel.FakeTransport();

    channel.holder.current = remote;

    const music = useMusicStore();

    await music.playTracks([track('a')]);

    remoteState('someone-else');

    expect(ids(music.queue)).toEqual(['a']);
  });

  it('本地动作广播意图与快照', async () => {
    const remote = new channel.FakeTransport();

    channel.holder.current = remote;

    const music = useMusicStore();

    await music.playTracks([track('a')]);

    remote.sent.length = 0;
    music.setVolume(0.2);

    const messages = remote.sent.map(raw => JSON.parse(raw) as MusicMessage);

    expect(
      messages.some(
        message =>
          message.type === 'action' &&
          message.action === 'volume' &&
          message.value === 0.2,
      ),
    ).toBe(true);
    expect(
      messages.some(
        message => message.type === 'state' && message.state.volume === 0.2,
      ),
    ).toBe(true);
  });

  it('自己的消息被回送时忽略（防回声）', async () => {
    const remote = new channel.FakeTransport();

    remote.echo = true;
    channel.holder.current = remote;

    const music = useMusicStore();

    await music.playTracks([track('a')]);

    expect(music.isPlaying).toBe(true);
    expect(music.queue).toHaveLength(1);
  });
});

describe('队列排序', () => {
  it('移动非当前项：跨越当前下标时当前项不变', async () => {
    const music = useMusicStore();

    await music.playTracks(
      [track('a'), track('b'), track('c'), track('d')],
      'c',
    );

    music.moveInQueue(0, 2);

    expect(ids(music.queue)).toEqual(['b', 'c', 'a', 'd']);
    expect(music.currentTrack?.id).toBe('c');
    expect(music.currentIndex).toBe(1);
  });

  it('移动当前项：当前下标跟着走', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b'), track('c')], 'b');

    music.moveInQueue(1, 2);

    expect(ids(music.queue)).toEqual(['a', 'c', 'b']);
    expect(music.currentTrack?.id).toBe('b');
    expect(music.currentIndex).toBe(2);
  });

  it('越界或原地不动不改队列引用', async () => {
    const music = useMusicStore();

    await music.playTracks([track('a'), track('b')], 'a');

    const before = music.queue;

    music.moveInQueue(1, 1);
    music.moveInQueue(-1, 0);
    music.moveInQueue(0, 5);

    expect(music.queue).toBe(before);
    expect(music.currentIndex).toBe(0);
  });
});

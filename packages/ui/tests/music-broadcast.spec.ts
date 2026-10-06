import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import {
  createMusicBus,
  decodeMusicMessage,
  encodeMusicMessage,
  type MusicMessage,
  type MusicSnapshot,
  type MusicTransport,
} from '@/features/music/broadcast';
import { createMusicSync, type MusicSyncState } from '@/features/music/sync';
import type { MusicMode, MusicTrack } from '@/features/music/track';

function track(id: string): MusicTrack {
  return { id, name: `${id}.mp3`, path: `/${id}.mp3`, url: `/cdn/${id}.mp3` };
}

function snapshot(overrides: Partial<MusicSnapshot> = {}): MusicSnapshot {
  return {
    queue: [track('a'), track('b')],
    currentIndex: 1,
    mode: 'loop-all',
    volume: 0.4,
    currentTime: 12,
    duration: 120,
    isPlaying: true,
    ...overrides,
  };
}

/** 手动通道：消息只在 deliver() 时才交给订阅者，方便逐条断言。 */
class FakeTransport implements MusicTransport {
  handler: ((data: unknown) => void) | null = null;
  sent: string[] = [];
  /** 打开后 post 立刻回送给自己，用来验证「忽略自身消息」。 */
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

  last(): MusicMessage {
    return JSON.parse(this.sent[this.sent.length - 1]) as MusicMessage;
  }
}

function syncState(): MusicSyncState {
  return {
    queue: ref<MusicTrack[]>([]),
    currentIndex: ref(-1),
    mode: ref<MusicMode>('sequence'),
    volume: ref(0.8),
    currentTime: ref(0),
    duration: ref(0),
    isPlaying: ref(false),
  };
}

describe('消息编解码', () => {
  it('三种消息往返一致', () => {
    const messages: MusicMessage[] = [
      { type: 'hello', senderId: 'tab-a' },
      { type: 'action', senderId: 'tab-a', action: 'seek', value: 12.5 },
      { type: 'state', senderId: 'tab-a', state: snapshot() },
      {
        type: 'state',
        senderId: 'tab-a',
        targetId: 'tab-b',
        state: snapshot(),
      },
    ];

    for (const message of messages) {
      expect(decodeMusicMessage(encodeMusicMessage(message))).toEqual(message);
    }
  });

  it('坏消息一律当没收到', () => {
    const bad = [
      undefined,
      null,
      42,
      'not json',
      JSON.stringify({ type: 'hello' }),
      JSON.stringify({ type: 'hello', senderId: 1 }),
      JSON.stringify({ type: 'action', senderId: 'a', action: 'explode' }),
      JSON.stringify({
        type: 'state',
        senderId: 'a',
        state: { ...snapshot(), mode: 'random' },
      }),
      JSON.stringify({
        type: 'state',
        senderId: 'a',
        state: { ...snapshot(), queue: [{ id: 'a' }] },
      }),
      JSON.stringify({ type: 'state', senderId: 'a', state: { queue: [] } }),
    ];

    for (const raw of bad) expect(decodeMusicMessage(raw)).toBeNull();
  });
});

describe('通道总线', () => {
  it('发出的消息带 senderId，远端消息交给 onMessage', () => {
    const transport = new FakeTransport();
    const received: MusicMessage[] = [];
    const bus = createMusicBus({
      transport,
      senderId: 'tab-a',
      onMessage: message => received.push(message),
    });

    bus.post({ type: 'hello' });

    expect(JSON.parse(transport.sent[0])).toEqual({
      type: 'hello',
      senderId: 'tab-a',
    });

    transport.deliver({ type: 'hello', senderId: 'tab-b' });

    expect(received).toEqual([{ type: 'hello', senderId: 'tab-b' }]);
  });

  it('忽略自己发出的消息（防回声）', () => {
    const transport = new FakeTransport();

    transport.echo = true;

    const onMessage = vi.fn();
    const bus = createMusicBus({ transport, senderId: 'tab-a', onMessage });

    bus.post({ type: 'action', action: 'toggle' });

    expect(transport.sent).toHaveLength(1);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('坏消息不进 onMessage', () => {
    const transport = new FakeTransport();
    const onMessage = vi.fn();

    createMusicBus({ transport, senderId: 'tab-a', onMessage });
    transport.deliver('{oops');
    transport.deliver({ type: 'state', senderId: 'tab-b', state: {} });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('没有通道时不抛错（老浏览器降级）', () => {
    const bus = createMusicBus({ transport: null, onMessage: vi.fn() });

    expect(() => bus.post({ type: 'hello' })).not.toThrow();
    expect(() => bus.close()).not.toThrow();
  });
});

describe('跨标签页协调器', () => {
  function setup() {
    const transport = new FakeTransport();
    const state = syncState();
    const silence = vi.fn();
    const afterApply = vi.fn();
    const sync = createMusicSync(state, {
      silence,
      afterApply,
      transport,
      senderId: 'tab-a',
    });

    return { transport, state, silence, afterApply, sync };
  }

  it('远端 state 落成镜像，并强制暂停', () => {
    const { transport, state, silence, afterApply } = setup();

    state.isPlaying.value = true;
    transport.deliver({ type: 'state', senderId: 'tab-b', state: snapshot() });

    expect(silence).toHaveBeenCalledTimes(1);
    expect(state.queue.value.map(item => item.id)).toEqual(['a', 'b']);
    expect(state.currentIndex.value).toBe(1);
    expect(state.mode.value).toBe('loop-all');
    expect(state.volume.value).toBe(0.4);
    expect(state.currentTime.value).toBe(12);
    expect(state.isPlaying.value).toBe(false);
    expect(afterApply).toHaveBeenCalledWith(snapshot());
  });

  it('发送方只是暂停态镜像时，不打断正在出声的本页', () => {
    const { transport, state, silence } = setup();

    state.isPlaying.value = true;
    transport.deliver({
      type: 'state',
      senderId: 'tab-b',
      state: snapshot({ isPlaying: false }),
    });

    // 新标签页 hydrate 后会广播自己的暂停态：不能让在播的那页静音。
    expect(silence).not.toHaveBeenCalled();
    expect(state.isPlaying.value).toBe(true);
    expect(state.queue.value).toEqual([]);
  });

  it('正在播时忽略过期的定向回包（不被自己的 hello 应答按停）', () => {
    const { transport, state, silence } = setup();

    state.isPlaying.value = true;
    state.currentTime.value = 30;

    transport.deliver({
      type: 'state',
      senderId: 'tab-b',
      targetId: 'tab-a',
      state: snapshot({ currentTime: 2 }),
    });

    expect(silence).not.toHaveBeenCalled();
    expect(state.isPlaying.value).toBe(true);
    expect(state.currentTime.value).toBe(30);
  });

  it('暂停时收到的暂停态镜像照常落地', () => {
    const { transport, state } = setup();

    transport.deliver({
      type: 'state',
      senderId: 'tab-b',
      state: snapshot({ isPlaying: false }),
    });

    expect(state.queue.value.map(item => item.id)).toEqual(['a', 'b']);
    expect(state.currentTime.value).toBe(12);
  });

  it('远端 action 只让本页静默，不改播放状态', () => {
    const { transport, state, silence } = setup();

    transport.deliver({
      type: 'action',
      senderId: 'tab-b',
      action: 'toggle',
    });

    expect(silence).toHaveBeenCalledTimes(1);
    expect(state.isPlaying.value).toBe(false);
    expect(state.queue.value).toEqual([]);
  });

  it('hello 收到后回一份定向快照', () => {
    const { transport, state } = setup();

    state.queue.value = [track('a')];
    state.currentIndex.value = 0;

    transport.deliver({ type: 'hello', senderId: 'tab-b' });

    expect(transport.last()).toEqual({
      type: 'state',
      senderId: 'tab-a',
      targetId: 'tab-b',
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
  });

  it('本地没东西可分享时不应答 hello', () => {
    const { transport } = setup();

    transport.deliver({ type: 'hello', senderId: 'tab-b' });

    expect(transport.sent).toEqual([]);
  });

  it('定向给别人的快照不落地', () => {
    const { transport, state, silence } = setup();

    transport.deliver({
      type: 'state',
      senderId: 'tab-b',
      targetId: 'tab-c',
      state: snapshot(),
    });

    expect(silence).not.toHaveBeenCalled();
    expect(state.queue.value).toEqual([]);
  });

  it('应用远端消息期间不回播（无回声）', () => {
    const { transport, state, sync } = setup();

    state.queue.value = [track('a')];
    transport.sent.length = 0;

    transport.deliver({ type: 'state', senderId: 'tab-b', state: snapshot() });
    sync.announceState();

    // 应用期间 snapshot 写入触发的 announceState 被吞掉，只剩显式那一条。
    expect(transport.sent).toHaveLength(1);
  });

  it('announce 先发意图再发快照', () => {
    const { transport, sync, state } = setup();

    state.queue.value = [track('a')];
    sync.announce('next');

    expect(transport.sent.map(raw => JSON.parse(raw).type)).toEqual([
      'action',
      'state',
    ]);
  });
});

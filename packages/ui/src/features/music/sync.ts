/**
 * 跨标签页协调的 store 侧接线：把 reactive 状态接到通道上。
 *
 * 出声规则由调用方（stores/music.ts）保证：
 * 1. 只有本页的用户手势能让本页出声；
 * 2. 别的标签页接管出声时，本页引擎必须静默。
 */

import { getCurrentScope, onScopeDispose, type Ref } from 'vue';

import {
  createMusicBus,
  createSenderId,
  type MusicAction,
  type MusicSnapshot,
  type MusicTransport,
} from './broadcast';
import type { MusicMode, MusicTrack } from './track';

/** 需要跨标签页镜像的 reactive 字段；协调器直接读写它们，store 不必再抄一份 getter/setter。 */
export interface MusicSyncState {
  queue: Ref<MusicTrack[]>;
  currentIndex: Ref<number>;
  mode: Ref<MusicMode>;
  volume: Ref<number>;
  currentTime: Ref<number>;
  duration: Ref<number>;
  isPlaying: Ref<boolean>;
}

export interface MusicSyncOptions {
  /** 收到远端播放类消息时停掉本页引擎：不变量「同一时刻最多一个标签页出声」。 */
  silence: () => void;
  /** 快照落地后的本页善后（引擎音量、续播位置）。 */
  afterApply?: (snapshot: MusicSnapshot) => void;
  /** 通道由调用方注入：store 传真实 BroadcastChannel，单测传假通道。 */
  transport: MusicTransport | null;
  senderId?: string;
}

export interface MusicSync {
  senderId: string;
  /** 本地动作：先发意图，再发整份快照；应用远端消息期间静默，避免回声。 */
  announce: (action?: MusicAction, value?: number | string) => void;
  announceState: () => void;
  /** 新标签页对齐：请求当前标签页回一份快照。 */
  hello: () => void;
  close: () => void;
}

export function snapshotOf(state: MusicSyncState): MusicSnapshot {
  return {
    queue: state.queue.value,
    currentIndex: state.currentIndex.value,
    mode: state.mode.value,
    volume: state.volume.value,
    currentTime: state.currentTime.value,
    duration: state.duration.value,
    isPlaying: state.isPlaying.value,
  };
}

/** 只镜像界面：远端快照永不播放，isPlaying 一律落回 false。 */
export function applySnapshot(
  snapshot: MusicSnapshot,
  state: MusicSyncState,
): void {
  state.queue.value = snapshot.queue;
  state.currentIndex.value = snapshot.currentIndex;
  state.mode.value = snapshot.mode;
  state.volume.value = snapshot.volume;
  state.currentTime.value = snapshot.currentTime;
  state.duration.value = snapshot.duration;
  state.isPlaying.value = false;
}

/** 会接管出声的动作意图：收到这些意图时本页必须让位。 */
const PLAYBACK_ACTIONS: readonly MusicAction[] = [
  'toggle',
  'next',
  'prev',
  'select',
  'clear',
];

export function createMusicSync(
  state: MusicSyncState,
  options: MusicSyncOptions,
): MusicSync {
  const senderId = options.senderId ?? createSenderId();
  /** 应用远端消息期间为真：本页的 reactive 写入不再回播。 */
  let applying = false;

  function postState(targetId?: string): void {
    bus.post({ type: 'state', targetId, state: snapshotOf(state) });
  }

  /** 落一份远端快照；期间本页的 reactive 写入不回播，避免回声。 */
  function applyRemote(snapshot: MusicSnapshot): void {
    applying = true;

    try {
      applySnapshot(snapshot, state);
      options.afterApply?.(snapshot);
    } finally {
      applying = false;
    }
  }

  const bus = createMusicBus({
    transport: options.transport,
    senderId,
    onMessage: message => {
      if (message.type === 'hello') {
        // 没有可分享的曲目就不应答：别把新开的标签页本地恢复出来的队列冲掉。
        if (state.queue.value.length > 0) postState(message.senderId);

        return;
      }

      // 定向回包（hello 的应答）只是镜像信息：不夺权、不静音。
      // 它可能在「本页刚起播」之后才到（回包是过期的），此时必须忽略，否则新起的播会被自己按停。
      if (message.type === 'state' && message.targetId !== undefined) {
        if (message.targetId !== senderId || state.isPlaying.value) return;

        applyRemote(message.state);

        return;
      }

      // 对方接管出声（正在播 / 播放类手势）时本页必须让位；
      // 对方只是暂停态的镜像或队列编辑时别打断本页——否则新标签页一 hydrate 就把音乐掐了。
      const takeover =
        message.type === 'state'
          ? message.state.isPlaying
          : PLAYBACK_ACTIONS.includes(message.action);

      if (!takeover && state.isPlaying.value) return;

      options.silence();

      if (message.type === 'state') applyRemote(message.state);
    },
  });

  // 与 useFloater 一致：工厂自己登记清理，store 里少一行接线。
  if (getCurrentScope()) onScopeDispose(() => bus.close());

  return {
    senderId,
    announce: (action, value) => {
      if (applying) return;

      if (action) bus.post({ type: 'action', action, value });

      postState();
    },
    announceState: () => {
      if (!applying) postState();
    },
    hello: () => bus.post({ type: 'hello' }),
    close: () => bus.close(),
  };
}

/**
 * 跨标签页播放协调的消息层：契约、编解码、通道封装。
 * 出声规则与 store 接线见 sync.ts / stores/music.ts。
 */

import { MUSIC_MODES, type MusicMode, type MusicTrack } from './track';

/** 通道名固定：同源的其它标签页必须落在同一条广播上。 */
export const MUSIC_CHANNEL_NAME = 'share-file-music';

/** 本地动作意图：远端只据此停掉引擎，真正的状态以随后的 state 快照为准。 */
export const MUSIC_ACTIONS = [
  'toggle',
  'next',
  'prev',
  'seek',
  'select',
  'clear',
  'volume',
  'mode',
  'move',
] as const;

export type MusicAction = (typeof MUSIC_ACTIONS)[number];

export interface MusicSnapshot {
  queue: MusicTrack[];
  currentIndex: number;
  mode: MusicMode;
  volume: number;
  currentTime: number;
  /** 时长也一起镜像：镜像页没加载引擎，光靠进度条自身拿不到总长。 */
  duration: number;
  isPlaying: boolean;
}

export interface MusicStateMessage {
  type: 'state';
  senderId: string;
  /** 定向应答（hello 的回复）：只有发起者应用它，避免旁观标签页被连带静音。 */
  targetId?: string;
  state: MusicSnapshot;
}

export interface MusicActionMessage {
  type: 'action';
  senderId: string;
  action: MusicAction;
  value?: number | string;
}

export interface MusicHelloMessage {
  type: 'hello';
  senderId: string;
}

export type MusicMessage =
  | MusicStateMessage
  | MusicActionMessage
  | MusicHelloMessage;

export type MusicOutgoing =
  | Omit<MusicStateMessage, 'senderId'>
  | Omit<MusicActionMessage, 'senderId'>
  | Omit<MusicHelloMessage, 'senderId'>;

export function encodeMusicMessage(message: MusicMessage): string {
  return JSON.stringify(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTrack(value: unknown): value is MusicTrack {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.path === 'string' &&
    typeof value.url === 'string'
  );
}

function isTrackList(value: unknown): value is MusicTrack[] {
  return Array.isArray(value) && value.every((item: unknown) => isTrack(item));
}

function isMode(value: unknown): value is MusicMode {
  return (
    typeof value === 'string' &&
    (MUSIC_MODES as readonly string[]).includes(value)
  );
}

function isSnapshot(value: unknown): value is MusicSnapshot {
  return (
    isRecord(value) &&
    isTrackList(value.queue) &&
    Number.isInteger(value.currentIndex) &&
    isMode(value.mode) &&
    isFiniteNumber(value.volume) &&
    isFiniteNumber(value.currentTime) &&
    isFiniteNumber(value.duration) &&
    typeof value.isPlaying === 'boolean'
  );
}

function isAction(value: unknown): value is MusicAction {
  return (
    typeof value === 'string' &&
    (MUSIC_ACTIONS as readonly string[]).includes(value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 坏消息（旧版本、被截断、其它页面同名通道）一律当没收到。 */
export function decodeMusicMessage(raw: unknown): MusicMessage | null {
  if (typeof raw !== 'string') return null;

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.senderId !== 'string') return null;

  if (parsed.type === 'hello') {
    return { type: 'hello', senderId: parsed.senderId };
  }

  if (parsed.type === 'action' && isAction(parsed.action)) {
    return {
      type: 'action',
      senderId: parsed.senderId,
      action: parsed.action,
      value:
        typeof parsed.value === 'string' || typeof parsed.value === 'number'
          ? parsed.value
          : undefined,
    };
  }

  if (parsed.type === 'state' && isSnapshot(parsed.state)) {
    return {
      type: 'state',
      senderId: parsed.senderId,
      targetId:
        typeof parsed.targetId === 'string' ? parsed.targetId : undefined,
      state: parsed.state,
    };
  }

  return null;
}

export interface MusicTransport {
  post(data: string): void;
  subscribe(handler: (data: unknown) => void): () => void;
  close(): void;
}

/**
 * BroadcastChannel 不可用时（老浏览器、单测的 happy-dom 环境）返回 null，
 * 跨标签页协调静默降级，单独打开一个标签页一切照旧。
 */
export function createBroadcastTransport(
  name: string = MUSIC_CHANNEL_NAME,
): MusicTransport | null {
  const ctor =
    typeof window === 'undefined' ? undefined : window.BroadcastChannel;

  if (!ctor) return null;

  const channel = new ctor(name);

  return {
    post: data => channel.postMessage(data),
    subscribe: handler => {
      const listener = (event: MessageEvent): void => handler(event.data);

      channel.addEventListener('message', listener);

      return () => channel.removeEventListener('message', listener);
    },
    close: () => channel.close(),
  };
}

export function createSenderId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export interface MusicBus {
  senderId: string;
  post(message: MusicOutgoing): void;
  close(): void;
}

export interface MusicBusOptions {
  transport: MusicTransport | null;
  onMessage: (message: MusicMessage) => void;
  senderId?: string;
}

export function createMusicBus(options: MusicBusOptions): MusicBus {
  const senderId = options.senderId ?? createSenderId();
  const unsubscribe =
    options.transport?.subscribe(raw => {
      const message = decodeMusicMessage(raw);

      // 丢回自己的消息（防回声）：BroadcastChannel 不回送，但假通道 / 其它实现可能会。
      if (!message || message.senderId === senderId) return;

      options.onMessage(message);
    }) ?? null;

  return {
    senderId,
    post: message => {
      const payload: MusicMessage = { ...message, senderId };

      options.transport?.post(encodeMusicMessage(payload));
    },
    close: () => {
      unsubscribe?.();
      options.transport?.close();
    },
  };
}

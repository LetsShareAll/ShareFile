import { resolveNodeDisplay } from '../browse/nodeDisplay';
import type { ShareNode } from '../../domain/share-file';

export type MusicMode = 'sequence' | 'loop-all' | 'loop-one' | 'shuffle';

export interface MusicTrack {
  id: string;
  name: string;
  path: string;
  url: string;
  size?: number;
  updated_at?: string;
}

export interface MusicHistoryEntry {
  id: string;
  name: string;
  path: string;
  url: string;
  playedAt: string;
}

/** 持久化的播放快照：队列、下标、模式、音量、进度。 */
export interface MusicState {
  queue: MusicTrack[];
  currentIndex: number;
  mode: MusicMode;
  volume: number;
  currentTime: number;
}

export const DEFAULT_VOLUME = 0.8;

export const MUSIC_MODES: readonly MusicMode[] = [
  'sequence',
  'loop-all',
  'loop-one',
  'shuffle',
];
const isMusicMode = (value: unknown): value is MusicMode =>
  MUSIC_MODES.some(mode => mode === value);

export function isAudioNode(node: ShareNode): boolean {
  return resolveNodeDisplay(node).className === 'audio';
}

export function buildQueueFromDirectory(
  nodes: readonly ShareNode[],
  getPath: (nodeId: string) => string,
  getUrl: (node: ShareNode) => string,
): MusicTrack[] {
  return nodes.filter(isAudioNode).map(node => ({
    id: node.id,
    name: node.name,
    path: getPath(node.id),
    url: getUrl(node),
    size: node.size,
    updated_at: node.updated_at,
  }));
}

/** 随机取一首；队列多于一首时避开 currentIndex，保证“不重复上一首”。 */
function randomIndex(
  length: number,
  currentIndex: number,
  random: () => number,
): number {
  const value = random();
  const raw = Number.isFinite(value) ? Math.floor(value * length) : 0;
  const index = Math.min(length - 1, Math.max(0, raw));

  return length > 1 && index === currentIndex ? (index + 1) % length : index;
}

export function getNextIndex(
  length: number,
  currentIndex: number,
  mode: MusicMode,
  random: () => number = Math.random,
): number | null {
  if (length <= 0) return null;

  switch (mode) {
    case 'loop-one':
      return currentIndex >= 0 && currentIndex < length ? currentIndex : 0;

    case 'loop-all':
      return currentIndex < 0 || currentIndex >= length - 1
        ? 0
        : currentIndex + 1;

    case 'shuffle':
      return length === 1 ? 0 : randomIndex(length, currentIndex, random);

    default:
      // sequence：队尾返回 null，由调用方停住。
      if (currentIndex < 0) return 0;

      return currentIndex >= length - 1 ? null : currentIndex + 1;
  }
}

export function getPrevIndex(
  length: number,
  currentIndex: number,
  mode: MusicMode,
  random: () => number = Math.random,
): number | null {
  if (length <= 0) return null;

  switch (mode) {
    case 'loop-one':
      return currentIndex >= 0 && currentIndex < length ? currentIndex : 0;

    case 'loop-all':
      return currentIndex <= 0 || currentIndex >= length
        ? length - 1
        : currentIndex - 1;

    case 'shuffle':
      return length === 1 ? 0 : randomIndex(length, currentIndex, random);

    default:
      // sequence：队首返回 null，由调用方决定停住或重头播放。
      return currentIndex <= 0 ? null : currentIndex - 1;
  }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
}

/** `formatDuration` 的逆运算：把 `3:07` / `1:02:03` 还原成秒；认不出返回 undefined。 */
export function parseDurationSeconds(text?: string): number | undefined {
  const parts = text?.split(':') ?? [];

  if (parts.length < 2 || parts.length > 3) return undefined;

  const values = parts.map(part => Number(part));

  if (values.some(value => !Number.isInteger(value) || value < 0)) {
    return undefined;
  }

  return values.reduce((total, value) => total * 60 + value, 0);
}

function toTrack(value: unknown): MusicTrack | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.path !== 'string' ||
    typeof record.url !== 'string'
  ) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    path: record.path,
    url: record.url,
    ...(typeof record.size === 'number' && { size: record.size }),
    ...(typeof record.updated_at === 'string' && {
      updated_at: record.updated_at,
    }),
  };
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toIndex(value: unknown, length: number): number {
  const index = toNumber(value, -1);

  if (Number.isInteger(index) && index >= -1 && index < length) return index;

  return length > 0 ? 0 : -1;
}

/** 非法 JSON / 结构不符返回 null；单字段非法时回落到默认值。 */
export function parseMusicState(raw: string | null): MusicState | null {
  if (!raw) return null;

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;

  if (!Array.isArray(record.queue)) return null;

  const queue = record.queue
    .map(toTrack)
    .filter((track): track is MusicTrack => track !== null);

  return {
    queue,
    currentIndex: toIndex(record.currentIndex, queue.length),
    mode: isMusicMode(record.mode) ? record.mode : 'sequence',
    volume: Math.min(1, Math.max(0, toNumber(record.volume, DEFAULT_VOLUME))),
    currentTime: Math.max(0, toNumber(record.currentTime, 0)),
  };
}

export function serializeMusicState(state: MusicState): string {
  return JSON.stringify({
    queue: state.queue,
    currentIndex: state.currentIndex,
    mode: state.mode,
    volume: state.volume,
    currentTime: Math.max(0, state.currentTime),
  });
}

import { ref, type Ref } from 'vue';

import type { KeyValueStorage } from '../../domain/external';
import { createLocalStorage } from '../../platform/storage';
import {
  parseMusicState,
  serializeMusicState,
  type MusicHistoryEntry,
  type MusicState,
  type MusicTrack,
} from './track';

export const MUSIC_STATE_KEY = 'music';
export const MUSIC_HISTORY_KEY = 'music-history';
export const MUSIC_HISTORY_LIMIT = 50;
export const MUSIC_PERSIST_INTERVAL_MS = 3000;

// createLocalStorage 只在读写时访问 window，模块加载阶段不会抛错。
const storage: KeyValueStorage = createLocalStorage();

export function readMusicState(): MusicState | null {
  return parseMusicState(storage.getItem(MUSIC_STATE_KEY));
}

export function writeMusicState(state: MusicState): void {
  storage.setItem(MUSIC_STATE_KEY, serializeMusicState(state));
}

export function createHistoryEntry(
  track: MusicTrack,
  playedAt: Date = new Date(),
): MusicHistoryEntry {
  return {
    id: track.id,
    name: track.name,
    path: track.path,
    url: track.url,
    playedAt: playedAt.toISOString(),
  };
}

export function isHistoryEntry(value: unknown): value is MusicHistoryEntry {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.path === 'string' &&
    typeof record.url === 'string' &&
    typeof record.playedAt === 'string'
  );
}

/** 最新在前、按 id 去重（重播同一首提到最前）、上限 50 条。 */
export function pushHistoryEntry(
  entries: readonly MusicHistoryEntry[],
  entry: MusicHistoryEntry,
  limit: number = MUSIC_HISTORY_LIMIT,
): MusicHistoryEntry[] {
  const kept = [entry, ...entries.filter(item => item.id !== entry.id)];

  return kept.slice(0, Math.max(0, limit));
}

export function readMusicHistory(): MusicHistoryEntry[] {
  const raw = storage.getItem(MUSIC_HISTORY_KEY);

  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(isHistoryEntry).slice(0, MUSIC_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function writeMusicHistory(entries: readonly MusicHistoryEntry[]): void {
  storage.setItem(
    MUSIC_HISTORY_KEY,
    JSON.stringify(entries.slice(0, MUSIC_HISTORY_LIMIT)),
  );
}

/** 节流写入播放快照：timeupdate 触发频繁，只在必要时落盘。 */
export function createMusicPersister(
  snapshot: () => MusicState,
  interval: number = MUSIC_PERSIST_INTERVAL_MS,
): (force?: boolean) => void {
  let lastAt = 0;

  return (force = false): void => {
    const now = Date.now();

    if (!force && now - lastAt < interval) return;

    lastAt = now;
    writeMusicState(snapshot());
  };
}

export interface MusicHistoryLog {
  entries: Ref<MusicHistoryEntry[]>;
  push(track: MusicTrack): void;
  hydrate(): void;
}

export function createMusicHistoryLog(): MusicHistoryLog {
  const entries = ref<MusicHistoryEntry[]>([]);

  return {
    entries,
    push(track: MusicTrack): void {
      entries.value = pushHistoryEntry(
        entries.value,
        createHistoryEntry(track),
      );
      writeMusicHistory(entries.value);
    },
    hydrate(): void {
      entries.value = readMusicHistory();
    },
  };
}

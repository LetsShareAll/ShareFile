/**
 * 队列项的标签信息缓存（时长 / 标题 / 艺术家）：38–56 MB 的 FLAC 解析一次
 * 就是一次网络请求，所以结果按「id + size」落一份 localStorage；
 * 封面是 ObjectURL，不能序列化、也必须由持有者 revoke，因此只留在内存里。
 */
import { createLocalStorage } from '../../platform/storage';

export const TRACK_INFO_STORAGE_KEY = 'music-info';

/** localStorage 最多留多少条，超出时按 updatedAt 淘汰最旧的。 */
const MAX_ENTRIES = 300;

export interface TrackInfo {
  id: string;
  duration?: number;
  title?: string;
  artist?: string;
  size?: number;
  updatedAt: string;
}

export interface TrackInfoInput {
  id: string;
  duration?: number;
  title?: string;
  artist?: string;
  size?: number;
  updatedAt?: string;
  /** 只在内存缓存里保留，不落盘。 */
  coverUrl?: string;
}

export type TrackInfoStore = Map<string, TrackInfo>;

const storage = createLocalStorage();
const entries = new Map<string, TrackInfo>();
const covers = new Map<string, string>();
let hydrated = false;

/** 缓存键：同 id 但 size 变了（文件被替换）就当没缓存。 */
export function trackInfoKey(id: string, size?: number): string {
  return `${id}\u0001${size ?? ''}`;
}

/** 把 `3:07` / `1:02:03` 这样的展示时长还原成秒；认不出返回 undefined。 */
export function parseDurationSeconds(text?: string): number | undefined {
  const parts = text?.split(':') ?? [];

  if (parts.length < 2 || parts.length > 3) return undefined;

  const values = parts.map(part => Number(part));

  if (values.some(value => !Number.isInteger(value) || value < 0)) {
    return undefined;
  }

  return values.reduce((total, value) => total * 60 + value, 0);
}

function toDuration(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function toText(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function toEntry(value: unknown): TrackInfo | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const id = toText(record.id);

  if (!id) return null;

  const duration = toDuration(record.duration);
  const size = toDuration(record.size);
  const title = toText(record.title);
  const artist = toText(record.artist);

  return {
    id,
    updatedAt: toText(record.updatedAt) ?? '',
    ...(duration !== undefined && { duration }),
    ...(size !== undefined && { size }),
    ...(title !== undefined && { title }),
    ...(artist !== undefined && { artist }),
  };
}

/** 坏 JSON / 结构不符一律回落成空表。 */
export function parseTrackInfoStore(raw: string | null): TrackInfoStore {
  const result: TrackInfoStore = new Map();

  if (!raw) return result;

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return result;
  }

  if (!Array.isArray(parsed)) return result;

  for (const value of parsed) {
    const entry = toEntry(value);

    if (entry) result.set(entry.id, entry);
  }

  return result;
}

/** 逐字段挑着序列化：运行时字段（coverUrl / blob）永不落盘。 */
export function serializeTrackInfoStore(map: TrackInfoStore): string {
  return JSON.stringify(
    [...map.values()].map(entry => ({
      id: entry.id,
      duration: entry.duration,
      title: entry.title,
      artist: entry.artist,
      size: entry.size,
      updatedAt: entry.updatedAt,
    })),
  );
}

function hydrate(): void {
  if (hydrated) return;

  hydrated = true;
  entries.clear();

  for (const [id, entry] of parseTrackInfoStore(
    storage.getItem(TRACK_INFO_STORAGE_KEY),
  )) {
    entries.set(id, entry);
  }
}

function persist(): void {
  if (entries.size > MAX_ENTRIES) {
    const oldest = [...entries.values()].sort((a, b) =>
      a.updatedAt.localeCompare(b.updatedAt),
    );

    for (const entry of oldest.slice(0, entries.size - MAX_ENTRIES)) {
      entries.delete(entry.id);
    }
  }

  storage.setItem(TRACK_INFO_STORAGE_KEY, serializeTrackInfoStore(entries));
}

/** 读缓存：给了 size 而缓存里的 size 与之不同 → 视为失效（文件换过）。 */
export function getCachedTrackInfo(
  id: string,
  size?: number,
): TrackInfo | undefined {
  hydrate();

  const entry = entries.get(id);
  const matches =
    size === undefined || entry?.size === undefined || entry.size === size;

  return entry && matches ? entry : undefined;
}

/** 写入缓存；带 coverUrl 时只进内存，返回值是落盘后的那条记录。 */
export function putTrackInfo(input: TrackInfoInput): TrackInfo {
  hydrate();

  const { coverUrl, ...rest } = input;
  const entry: TrackInfo = {
    ...rest,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };

  entries.set(entry.id, entry);

  if (coverUrl !== undefined) setCover(entry.id, coverUrl);

  persist();

  return entry;
}

function setCover(id: string, url: string | undefined): void {
  const previous = covers.get(id);

  if (previous && previous !== url) URL.revokeObjectURL(previous);

  if (url) covers.set(id, url);
  else covers.delete(id);
}

/** 封面 ObjectURL 只活在内存里，随缓存淘汰 / 卸载回收。 */
export function readTrackInfoCover(id: string): string | undefined {
  return covers.get(id);
}

/** 不给 ids 就回收全部封面（对象 URL 泄漏的最后一道闸）。 */
export function releaseTrackInfoCovers(ids?: readonly string[]): void {
  for (const id of ids ?? [...covers.keys()]) setCover(id, undefined);
}

/** 清空内存与落盘缓存（测试与「重置」用）。 */
export function clearTrackInfoCache(): void {
  releaseTrackInfoCovers();
  entries.clear();
  hydrated = false;
  storage.removeItem(TRACK_INFO_STORAGE_KEY);
}

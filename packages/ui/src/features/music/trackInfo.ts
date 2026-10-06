/**
 * 队列项的标签信息缓存（时长 / 标题 / 艺术家）：38–56 MB 的 FLAC 解析一次
 * 就是一次网络请求，所以结果按「id + size」落一份 localStorage；
 * 封面是 ObjectURL，不能序列化，只能留在内存里。
 *
 * 封面缓存是模块级的（跨组件挂载存活）：面板卸载不回收，重开面板直接命中，
 * 不会为了同一张缩略图再解析一次 38–56 MB 的音频。
 * 内存代价：最多 `MAX_COVERS` 张封面 blob，且存的是标签里那张原始图
 * （不是重新压过的缩略图，常见 0.2–1 MB 一张），所以 30 张封顶在几 MB 到
 * 几十 MB 量级——上限与 LRU 就是为它准备的；再多的曲目一律解析后即弃。
 */
import { createLocalStorage } from '../../platform/storage';

export const TRACK_INFO_STORAGE_KEY = 'music-info';

/** localStorage 最多留多少条，超出时按 updatedAt 淘汰最旧的。 */
const MAX_ENTRIES = 300;

/** 内存里最多留多少张封面缩略图，超出时按 LRU 淘汰最久未用的。 */
export const MAX_COVERS = 30;

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

interface CoverEntry {
  url: string;
  /** 解析这张图时的文件大小：size 变了（文件被换过）就当它不是这一首的图。 */
  size?: number;
}

const storage = createLocalStorage();
const entries = new Map<string, TrackInfo>();
/** Map 的插入顺序就是最近使用顺序：命中读写都重排到队尾，淘汰从队首开始。 */
const covers = new Map<string, CoverEntry>();
let hydrated = false;

/** 缓存键：同 id 但 size 变了（文件被替换）就当没缓存。 */
export function trackInfoKey(id: string, size?: number): string {
  return `${id}\u0001${size ?? ''}`;
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

  // 封面只在两种情况下动：调用方给出了 coverUrl 字段（undefined 表示这一轮解析没有封面），
  // 或 size 变了（文件被换过）——后者手上这张缩略图必须作废。
  if (
    'coverUrl' in input ||
    sizeChanged(covers.get(entry.id)?.size, entry.size)
  ) {
    setCover(entry.id, entry.size, coverUrl);
  }

  persist();

  return entry;
}

function sizeChanged(
  previous: number | undefined,
  next: number | undefined,
): boolean {
  return previous !== undefined && next !== undefined && previous !== next;
}

function touchCover(id: string, entry: CoverEntry): void {
  covers.delete(id);
  covers.set(id, entry);
}

/** 超出上限时回收最久未用的那张（Map 队首）。 */
function evictCovers(): void {
  while (covers.size > MAX_COVERS) {
    const oldest = covers.keys().next().value;

    if (oldest === undefined) return;

    const entry = covers.get(oldest);

    covers.delete(oldest);

    if (entry) URL.revokeObjectURL(entry.url);
  }
}

/**
 * 同一 id 只留一张封面。URL 变了、或 size 变了（文件被换过）都先 revoke 旧的；
 * `url` 为 undefined 表示这一轮解析没有封面，此时只做失效处理。
 * revoke 只发生在这里、`evictCovers` 与 `clearTrackInfoCache`。
 */
function setCover(
  id: string,
  size: number | undefined,
  url: string | undefined,
): void {
  const previous = covers.get(id);

  if (previous) {
    if (previous.url === url && !sizeChanged(previous.size, size)) {
      touchCover(id, previous);

      return;
    }

    URL.revokeObjectURL(previous.url);
    covers.delete(id);
  }

  if (url === undefined) return;

  covers.set(id, { url, size });
  evictCovers();
}

/** 读封面：命中即刷新 LRU 位置；文件换过（size 不同）当没有。 */
export function readTrackInfoCover(
  id: string,
  size?: number,
): string | undefined {
  const entry = covers.get(id);

  if (!entry || sizeChanged(entry.size, size)) return undefined;

  touchCover(id, entry);

  return entry.url;
}

/** 只给 clearTrackInfoCache 用：回收全部封面（唯一一次整体 revoke）。 */
function releaseAllCovers(): void {
  for (const entry of covers.values()) URL.revokeObjectURL(entry.url);

  covers.clear();
}

/** 清空内存与落盘缓存（测试与「重置」用）。 */
export function clearTrackInfoCache(): void {
  releaseAllCovers();
  entries.clear();
  hydrated = false;
  storage.removeItem(TRACK_INFO_STORAGE_KEY);
}

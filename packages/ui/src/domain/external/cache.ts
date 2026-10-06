import {
  getMountSourceAccessCdn,
  getMountSourceSubPath,
  getMountSourceUseCdnIndex,
} from '../share-file/accessors';
import { normalizeShareFile } from '../share-file/normalize';
import type {
  ExternalSourceCache,
  MountSourceInfo,
  ShareFile,
} from '../share-file/schema';
import { hasRequiredCdnFileUrls } from './url';

/** 与 jsDelivr CDN 缓存对齐的 12 小时 TTL。 */
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
export const CACHE_KEY_PREFIX = 'share-file-external:v2:';
export const LEGACY_CACHE_KEY_PREFIXES = ['share-file-external:'];

/** 只依赖最小存储接口，便于测试注入与未来 SSR 复用。 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export function getCacheKeyBody(
  mountPoint: string,
  mountSource: MountSourceInfo,
): string {
  const { provider, repository, branch = 'main' } = mountSource;
  const subPath = getMountSourceSubPath(mountSource) ?? '/';
  const accessCdn = getMountSourceAccessCdn(mountSource) ?? 'jsdelivr';
  const useCdnIndex = getMountSourceUseCdnIndex(mountSource) ?? false;

  return `${provider}:${repository}:${branch}:${subPath}:${accessCdn}:${useCdnIndex}:${mountPoint}`;
}

export function getCacheKey(
  mountPoint: string,
  mountSource: MountSourceInfo,
): string {
  return `${CACHE_KEY_PREFIX}${getCacheKeyBody(mountPoint, mountSource)}`;
}

export function getLegacyCacheKeys(
  mountPoint: string,
  mountSource: MountSourceInfo,
): string[] {
  const body = getCacheKeyBody(mountPoint, mountSource);

  return LEGACY_CACHE_KEY_PREFIXES.map(prefix => `${prefix}${body}`);
}

/**
 * 读取外部源缓存：过期、结构损坏或 CDN 直链失效的缓存一律丢弃并清理。
 */
export function loadExternalCache(
  storage: KeyValueStorage,
  cacheKey: string,
  mountSource: MountSourceInfo,
  now: Date = new Date(),
): ShareFile | null {
  try {
    const cached = storage.getItem(cacheKey);

    if (!cached) return null;

    const cacheData = JSON.parse(cached) as ExternalSourceCache &
      Record<string, unknown>;
    const nowIso = now.toISOString();
    const expiresAt =
      typeof cacheData.expires_at === 'string'
        ? cacheData.expires_at
        : typeof cacheData.expiresAt === 'string'
          ? (cacheData.expiresAt as string)
          : undefined;

    if (!expiresAt || expiresAt < nowIso) {
      storage.removeItem(cacheKey);

      return null;
    }

    const data = normalizeShareFile(cacheData.data);

    if (!data) {
      storage.removeItem(cacheKey);

      return null;
    }

    // 只有使用 CDN 索引的挂载源才要求自带直链；默认挂载的索引不含 url，
    // 若无条件校验会把缓存全部判为无效（旧实现的历史缺陷）。
    if (
      getMountSourceUseCdnIndex(mountSource) &&
      !hasRequiredCdnFileUrls(data, mountSource)
    ) {
      storage.removeItem(cacheKey);

      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function saveExternalCache(
  storage: KeyValueStorage,
  cacheKey: string,
  data: ShareFile,
  mountPoint: string,
  mountSource: MountSourceInfo,
  now: Date = new Date(),
): void {
  try {
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

    const cacheData: ExternalSourceCache = {
      data,
      cached_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      mount_point: mountPoint,
      source: {
        provider: mountSource.provider,
        repository: mountSource.repository,
        branch: mountSource.branch || 'main',
        sub_path: getMountSourceSubPath(mountSource),
      },
    };

    storage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch {
    // 存储不可用时静默降级为不缓存。
  }
}

export function clearMountPointCache(
  storage: KeyValueStorage,
  mountPoint: string,
  mountSource: MountSourceInfo,
): void {
  [
    getCacheKey(mountPoint, mountSource),
    ...getLegacyCacheKeys(mountPoint, mountSource),
  ].forEach(cacheKey => storage.removeItem(cacheKey));
}

export function clearAllExternalCache(storage: KeyValueStorage): void {
  storage.keys().forEach(key => {
    if (
      key.startsWith(CACHE_KEY_PREFIX) ||
      LEGACY_CACHE_KEY_PREFIXES.some(prefix => key.startsWith(prefix))
    ) {
      storage.removeItem(key);
    }
  });
}

export function isExternalCacheKey(key: string): boolean {
  return (
    key.startsWith(CACHE_KEY_PREFIX) ||
    LEGACY_CACHE_KEY_PREFIXES.some(prefix => key.startsWith(prefix))
  );
}

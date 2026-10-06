import type { KeyValueStorage } from '../domain/external';

/** 404.html 与本模块共用的待恢复路由键。 */
export const PENDING_ROUTE_STORAGE_KEY = 'share-file:pending-route';

export function readPendingRoute(storage: KeyValueStorage): string | null {
  return storage.getItem(PENDING_ROUTE_STORAGE_KEY);
}

export function clearPendingRoute(storage: KeyValueStorage): void {
  storage.removeItem(PENDING_ROUTE_STORAGE_KEY);
}

/**
 * pathname 解码失败时退回原始值，避免非法百分号编码直接抛错。
 */
export function decodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

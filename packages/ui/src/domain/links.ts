import type { ShareNode } from './share-file';

/**
 * 站内文件路径（节点 ID 即物理路径）。
 */
export function getNodeFilePath(node: ShareNode): string {
  return node.id.startsWith('/') ? node.id : `/${node.id}`;
}

/**
 * 直链：优先用索引里的真实地址（本地 CDN 直链或外挂源构造的直链），否则退回站内路径。
 */
export function getNodeFileUrl(node: ShareNode): string {
  return node.url || getNodeFilePath(node);
}

/**
 * 页面深链：文件夹与分享场景使用，`?path=` 会被前端收敛为 clean URL。
 */
export function getNodePageUrl(path: string): string {
  if (!path || path === '/') return '/';

  return `/?path=${encodeURIComponent(path)}`;
}

export function getCurlCommand(url: string): string {
  return `curl -L -O '${url}'`;
}

export function getWgetCommand(url: string): string {
  return `wget '${url}'`;
}

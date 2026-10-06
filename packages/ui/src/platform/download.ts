import { getNodeFileUrl } from '../domain/links';
import type { ShareNode } from '../domain/share-file';

/**
 * 触发文件下载。
 *
 * 跨域直链（外挂源的 CDN 地址）上 `download` 属性会被浏览器忽略：若用同标签导航，
 * 整个 SPA 会被替换成 raw 文件内容。因此跨域链接一律开新标签并显式 `rel="noopener"`，
 * 同源链接（站内物理文件）保持原地下载语义。
 */
export function triggerFileDownload(node: ShareNode): void {
  const url = getNodeFileUrl(node);
  const link = document.createElement('a');

  link.href = url;
  link.download = node.name;

  if (!isSameOrigin(url)) {
    link.target = '_blank';
    link.rel = 'noopener';
  }

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

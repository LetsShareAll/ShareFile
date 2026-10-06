import { getNodeFileUrl, getNodePageUrl } from '../../domain/links';
import type { ShareNode } from '../../domain/share-file';
import { triggerFileDownload } from '../../platform/download';

/**
 * 预览内下载：渲染器只拿得到 URL 与文件名，这里构造与 `triggerFileDownload` 等价的节点，
 * 保持跨域直链开新标签、同源原地下载的既有语义。
 */
export function triggerPreviewDownload(fileUrl: string, name: string): void {
  const node: ShareNode = {
    id: name,
    name,
    type: 'file',
    parent: null,
    children: [],
    url: fileUrl,
  };

  triggerFileDownload(node);
}

export function openPreviewInNewTab(fileUrl: string): void {
  if (!fileUrl) return;

  window.open(fileUrl, '_blank', 'noopener');
}

/** 节点的绝对页面深链（与列表卡片上的「复制页面链接」同源同义）。 */
export function getAbsolutePageUrl(path: string): string {
  return new URL(getNodePageUrl(path), window.location.origin).href;
}

/** 节点的直链（优先索引里的真实地址）。 */
export function getPreviewFileUrl(node: ShareNode): string {
  return getNodeFileUrl(node);
}

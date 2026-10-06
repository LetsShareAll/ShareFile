import type { ShareNode } from '../../domain/share-file';
import { readBootPreviewPath, readPreviewPath } from './url';

/** 深链同步需要的宿主能力，由预览 store 提供。 */
export interface DeepLinkHost {
  isOpen(): boolean;
  currentNodeId(): string | null;
  resolve(path: string): ShareNode | undefined;
  open(target: ShareNode, history: 'replace' | 'none'): void;
  close(): void;
  showMissing(path: string): void;
}

function openPath(
  host: DeepLinkHost,
  path: string,
  history: 'replace' | 'none',
): void {
  const target = host.resolve(path);

  if (target && target.type === 'file') {
    host.open(target, history);

    return;
  }

  host.showMissing(path);
}

/** 启动时的 `?preview=`：地址栏可能已被 router 收敛成 clean URL，用文档原始地址兜底。 */
export function openFromLocation(host: DeepLinkHost): void {
  const path = readBootPreviewPath();

  if (path) openPath(host, path, 'replace');
}

/** 前进 / 后退：地址栏里没有 `?preview=` 就关掉弹窗，有就同步到对应文件。 */
export function syncFromLocation(host: DeepLinkHost): void {
  const path = readPreviewPath(window.location.search);

  if (!path) {
    if (host.isOpen()) host.close();

    return;
  }

  const target = host.resolve(path);

  if (target && target.type === 'file' && target.id === host.currentNodeId()) {
    return;
  }

  openPath(host, path, 'none');
}

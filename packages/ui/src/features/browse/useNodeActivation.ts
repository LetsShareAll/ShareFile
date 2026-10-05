import { confirmDialog } from '../../composables/useConfirmDialog';
import {
  getRedirectConfirmMessage,
  shouldConfirmRedirect,
} from '../../domain/redirects';
import type { ShareNode } from '../../domain/share-file';
import { usePreviewStore } from '../../stores/preview';

/**
 * 节点激活：目录交给路由，重定向节点交给确认弹窗，其余文件走预览/下载。
 */
export function useNodeActivation() {
  const preview = usePreviewStore();

  async function followRedirect(node: ShareNode): Promise<void> {
    const target = node.redirect_url;

    if (!target) return;

    if (!shouldConfirmRedirect(node)) {
      window.location.href = target;

      return;
    }

    const message = getRedirectConfirmMessage(node);
    const confirmed = await confirmDialog({
      title: '跳转提示',
      ...(node.redirect_confirm_message && message
        ? { html: message }
        : { message: message ?? target }),
      confirmText: '继续',
      cancelText: '取消',
    });

    if (confirmed) {
      window.open(target, '_blank', 'noopener');
    }
  }

  function activateNode(node: ShareNode): void {
    if (node.type === 'folder') return;

    if (node.redirect_url) {
      void followRedirect(node);

      return;
    }

    void preview.openFile(node);
  }

  return { activateNode };
}

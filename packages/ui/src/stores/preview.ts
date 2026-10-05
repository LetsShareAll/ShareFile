import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type { ShareNode } from '../domain/share-file';
import { triggerFileDownload } from '../platform/download';

// TODO(阶段⑤): 换成插件预览弹窗（requestId 竞态守卫），openFile 只负责打开预览。
/**
 * 当前实现：openFile 直接触发浏览器下载，视图不自行下载文件。
 */
export const usePreviewStore = defineStore('preview', () => {
  const isOpen = ref(false);
  const node = shallowRef<ShareNode | null>(null);

  function openFile(target: ShareNode): void {
    node.value = target;
    isOpen.value = true;
    triggerFileDownload(target);
  }

  return {
    isOpen,
    node,
    openFile,
  };
});

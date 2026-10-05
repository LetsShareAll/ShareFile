import { defineStore } from 'pinia';
import { ref, shallowRef, type Component } from 'vue';

import { getErrorMessage } from '../domain/format';
import { getNodeFileUrl } from '../domain/links';
import type { NodePluginMatchInput } from '../domain/plugins';
import type { ShareNode } from '../domain/share-file';
import { createBuiltinRegistry } from '../plugins';

/**
 * 预览状态机：插件注册表解析 → 异步预览组件；requestId 守卫竞态，未命中预览时开新标签。
 */
export const usePreviewStore = defineStore('preview', () => {
  const registry = createBuiltinRegistry();

  const isOpen = ref(false);
  const title = ref('');
  const loading = ref(false);
  const error = ref<string | null>(null);
  const component = shallowRef<Component | null>(null);
  const componentProps = ref<Record<string, unknown>>({});
  const node = shallowRef<ShareNode | null>(null);

  let requestId = 0;

  async function openFile(target: ShareNode): Promise<void> {
    node.value = target;
    title.value = target.name;
    isOpen.value = true;
    loading.value = true;
    error.value = null;
    component.value = null;

    const currentRequest = (requestId += 1);
    const fileUrl = getNodeFileUrl(target);

    try {
      const input: NodePluginMatchInput = {
        name: target.name,
        nodeType: target.type,
        node: target,
      };
      const resolved = registry.resolve(input);
      const preview = resolved.plugin.preview;

      const result = preview
        ? await preview({ ...input, fileUrl, nodeTypeInfo: resolved.info })
        : false;

      if (currentRequest !== requestId) return;

      if (!result) {
        // 与旧实现一致：没有可用预览时开新标签查看/下载。
        close();
        window.open(fileUrl, '_blank', 'noopener');

        return;
      }

      component.value = result;
      componentProps.value = {
        fileUrl,
        name: target.name,
        mime: resolved.info.mime,
      };
    } catch (previewError) {
      if (currentRequest !== requestId) return;

      error.value = getErrorMessage(previewError);
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  function close(): void {
    requestId += 1;
    isOpen.value = false;
    loading.value = false;
    error.value = null;
    component.value = null;
  }

  return {
    isOpen,
    title,
    loading,
    error,
    component,
    componentProps,
    node,
    openFile,
    close,
  };
});

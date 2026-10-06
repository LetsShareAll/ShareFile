import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref, shallowRef, type Component } from 'vue';

import { getErrorMessage } from '../domain/format';
import { getNodeFileUrl } from '../domain/links';
import type { NodePluginMatchInput } from '../domain/plugins';
import type { ShareNode } from '../domain/share-file';
import {
  openFromLocation,
  syncFromLocation,
  type DeepLinkHost,
} from '../features/preview/deepLink';
import { createFocusReturn } from '../features/preview/focusReturn';
import {
  findNodeIndex,
  getAdjacentNode,
  sortNavigationNodes,
} from '../features/preview/navigation';
import { prefetchPreviewChunk } from '../features/preview/prefetch';
import { resolveDirectoryPath, writePreviewUrl } from '../features/preview/url';
import { createBuiltinRegistry } from '../plugins';
import { useLibraryStore } from './library';
import { useUiStore } from './ui';

/** 大文件护栏只覆盖这三个渲染器，`size` 也只传给他们（其余渲染器契约不变）。 */
const GUARDED_PLUGIN_IDS = new Set(['text', 'code', 'markdown']);

/** 打开预览时的历史写法：首次打开 push，切换 / 深链 replace，地址同步不写。 */
type HistoryMode = 'push' | 'replace' | 'none';

/**
 * 预览状态机：插件注册表解析 → 异步预览组件；requestId 守卫竞态，未命中预览时开新标签。
 * 导航顺序与 BrowseView 的 `rows` 同源同序，`?preview=` 与地址栏双向同步。
 */
export const usePreviewStore = defineStore('preview', () => {
  const library = useLibraryStore();
  const ui = useUiStore();
  const registry = createBuiltinRegistry();
  const focusReturn = createFocusReturn();

  const isOpen = ref(false);
  const title = ref('');
  const loading = ref(false);
  const error = ref<string | null>(null);
  const component = shallowRef<Component | null>(null);
  const componentProps = ref<Record<string, unknown>>({});
  const node = shallowRef<ShareNode | null>(null);
  const directoryPath = ref(resolveDirectoryPath());

  let requestId = 0;

  /**
   * 与 BrowseView 的 rows 同源同序：搜索态取搜索结果，否则取当前目录，再套同一套排序参数。
   */
  const navigation = computed<ShareNode[]>(() => {
    const query = ui.query.trim();
    const nodes = query
      ? library.search(query)
      : library.getChildNodes(directoryPath.value);

    return sortNavigationNodes(nodes, {
      key: ui.sortKey,
      direction: ui.sortDirection,
      getPath: nodeId => library.getNodePathById(nodeId),
    });
  });

  const currentIndex = computed(() =>
    findNodeIndex(navigation.value, node.value?.id),
  );
  const canGoPrev = computed(() => currentIndex.value > 0);
  const canGoNext = computed(() => {
    const index = currentIndex.value;

    return index >= 0 && index < navigation.value.length - 1;
  });

  const deepLinkHost: DeepLinkHost = {
    isOpen: () => isOpen.value,
    currentNodeId: () => node.value?.id ?? null,
    resolve: path => library.resolveNodeByPath(path),
    open: (target, history) => void openFile(target, history),
    close,
    showMissing: showMissingTarget,
  };

  const onPopState = (): void => syncFromLocation(deepLinkHost);
  const goPrev = (): void => step(-1);
  const goNext = (): void => step(1);

  async function openFile(
    target: ShareNode,
    history: HistoryMode = 'push',
  ): Promise<void> {
    directoryPath.value = resolveDirectoryPath();
    focusReturn.capture();

    node.value = target;
    title.value = target.name;
    isOpen.value = true;
    loading.value = true;
    error.value = null;
    component.value = null;

    if (history !== 'none') {
      writePreviewUrl(history, library.getNodePathById(target.id));
    }

    // 打开后只前瞻相邻文件的 chunk，不预取文件内容。
    prefetchPreviewChunk(getAdjacentNode(navigation.value, target.id, 1));
    prefetchPreviewChunk(getAdjacentNode(navigation.value, target.id, -1));

    const currentRequest = (requestId += 1);
    const resolvedFileUrl = getNodeFileUrl(target);

    try {
      const input: NodePluginMatchInput = {
        name: target.name,
        nodeType: target.type,
        node: target,
      };
      const resolved = registry.resolve(input);
      const preview = resolved.plugin.preview;

      const result = preview
        ? await preview({
            ...input,
            fileUrl: resolvedFileUrl,
            nodeTypeInfo: resolved.info,
          })
        : false;

      if (currentRequest !== requestId) return;

      if (!result) {
        // 与旧实现一致：没有可用预览时开新标签查看/下载。
        close();
        window.open(resolvedFileUrl, '_blank', 'noopener');

        return;
      }

      component.value = result;
      componentProps.value = {
        fileUrl: resolvedFileUrl,
        name: target.name,
        mime: resolved.info.mime,
        ...(GUARDED_PLUGIN_IDS.has(resolved.plugin.id) &&
        target.size !== undefined
          ? { size: target.size }
          : {}),
      };
    } catch (previewError) {
      if (currentRequest !== requestId) return;

      error.value = getErrorMessage(previewError);
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  function step(direction: -1 | 1): void {
    const target = getAdjacentNode(navigation.value, node.value?.id, direction);

    if (target) void openFile(target, 'replace');
  }

  /** 深链目标不在索引里：弹窗内显示错误态而不是空弹窗。 */
  function showMissingTarget(path: string): void {
    focusReturn.capture();
    directoryPath.value = resolveDirectoryPath();
    node.value = null;
    title.value = path.split('/').filter(Boolean).pop() ?? path;
    isOpen.value = true;
    loading.value = false;
    component.value = null;
    error.value = '预览目标不存在或已被移除';
  }

  function close(): void {
    const wasOpen = isOpen.value;

    requestId += 1;
    isOpen.value = false;
    loading.value = false;
    error.value = null;
    component.value = null;

    if (!wasOpen) return;

    writePreviewUrl('replace', null);
    focusReturn.restore();
  }

  window.addEventListener('popstate', onPopState);
  onScopeDispose(() => window.removeEventListener('popstate', onPopState));

  return {
    isOpen,
    title,
    loading,
    error,
    component,
    componentProps,
    node,
    navigation,
    canGoPrev,
    canGoNext,
    openFile,
    close,
    goPrev,
    goNext,
    openFromLocation: () => openFromLocation(deepLinkHost),
  };
});

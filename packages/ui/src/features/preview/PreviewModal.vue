<script setup lang="ts">
import { ref, watch, computed } from 'vue';

import { useLibraryStore } from '../../stores/library';
import { usePreviewStore } from '../../stores/preview';
import {
  getAbsolutePageUrl,
  getPreviewFileUrl,
  openPreviewInNewTab,
  triggerPreviewDownload,
} from './actions';
import { isPlayerContext, trapFocus } from './modalKeyboard';
import PreviewFooter from './PreviewFooter.vue';
import PreviewLoading from './renderers/PreviewLoading.vue';
import { useModalShell } from './useModalShell';

const props = withDefaults(
  defineProps<{ visible: boolean; title: string; loading?: boolean }>(),
  { loading: false },
);

const emit = defineEmits<{ close: [] }>();

const preview = usePreviewStore();
const library = useLibraryStore();

const contentEl = ref<HTMLElement | null>(null);
const { rendered, shown, bodyEl, hasCodeContent } = useModalShell({
  visible: () => props.visible,
  onKeydown: handleKeydown,
  getFocusTarget: () => contentEl.value,
});

const fileUrl = computed(() =>
  preview.node ? getPreviewFileUrl(preview.node) : '',
);

const pageUrl = computed(() =>
  preview.node
    ? getAbsolutePageUrl(library.getNodePathById(preview.node.id))
    : '',
);

let deepLinkHandled = false;

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close');

    return;
  }

  if (event.key === 'Tab') {
    trapFocus(contentEl.value, event);

    return;
  }

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

  // 播放器聚焦或全屏时 ←/→ 归播放器（videoControls 已处理），弹窗不翻页。
  if (isPlayerContext(event.target)) return;

  event.preventDefault();

  if (event.key === 'ArrowLeft') preview.goPrev();
  else preview.goNext();
}

function download(): void {
  triggerPreviewDownload(fileUrl.value, preview.node?.name ?? props.title);
}

/** 外挂节点的挂载点路径：mount_point 存的是挂载点节点 ID。 */
const mountPath = computed(() =>
  preview.node?.source === 'external'
    ? library.getNodePathById(preview.node.mount_point ?? '')
    : '',
);

/**
 * 深链 `?preview=`：索引（含外挂源）合并完成后再解析目标，
 * 目标不在索引里时由 store 置错误态，弹窗内可关闭。
 */
watch(
  () => library.loading || library.externalLoading,
  busy => {
    if (busy || deepLinkHandled) return;

    deepLinkHandled = true;
    preview.openFromLocation();
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-if="rendered"
    class="modal-overlay"
    :class="{ show: shown }"
    role="dialog"
    aria-modal="true"
    aria-labelledby="preview-modal-title"
    @click.self="emit('close')"
  >
    <div ref="contentEl" class="modal-content" tabindex="-1">
      <div class="modal-header">
        <span id="preview-modal-title" class="modal-title">{{ title }}</span>
        <div class="modal-header-actions">
          <button
            v-if="fileUrl"
            class="preview-icon-btn"
            type="button"
            title="下载文件"
            aria-label="下载文件"
            @click="download"
          >
            <i class="fas fa-download" />
          </button>
          <button
            v-if="fileUrl"
            class="preview-icon-btn preview-newtab-btn"
            type="button"
            title="新标签打开"
            aria-label="新标签打开"
            @click="openPreviewInNewTab(fileUrl)"
          >
            <i class="fas fa-up-right-from-square" />
          </button>
          <button
            class="modal-close-btn"
            type="button"
            title="关闭预览"
            aria-label="关闭预览"
            @click="emit('close')"
          >
            <i class="fas fa-times" />
          </button>
        </div>
      </div>
      <div
        ref="bodyEl"
        class="modal-body"
        :class="{ 'modal-body-code': hasCodeContent }"
      >
        <PreviewLoading v-if="loading" message="正在加载预览..." />
        <slot v-else />
      </div>
      <PreviewFooter
        v-if="!loading && preview.node"
        :node="preview.node"
        :file-url="fileUrl"
        :page-url="pageUrl"
        :mount-path="mountPath"
        :can-navigate="preview.canGoPrev || preview.canGoNext"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { formatSize } from '../../domain/format';
import { openPreviewInNewTab, triggerPreviewDownload } from './actions';

const props = defineProps<{
  fileUrl: string;
  name: string;
  /** 已保留的行数。 */
  lines: number;
  /** 索引元数据 / 响应头给出的总体积，未知时不显示具体大小。 */
  totalBytes?: number;
}>();

const sizeText = computed(() => formatSize(props.totalBytes));
</script>

<template>
  <div class="preview-truncation" role="status">
    <span class="preview-truncation-text">
      <i class="fas fa-triangle-exclamation" />
      文件较大，已截断预览：共 {{ sizeText }}，已显示前 {{ lines }} 行
    </span>
    <span class="preview-truncation-actions">
      <button
        class="preview-action-btn"
        type="button"
        title="下载文件"
        @click="triggerPreviewDownload(fileUrl, name)"
      >
        <i class="fas fa-download" /> 下载
      </button>
      <button
        class="preview-action-btn"
        type="button"
        title="新标签打开"
        @click="openPreviewInNewTab(fileUrl)"
      >
        <i class="fas fa-up-right-from-square" /> 新标签打开
      </button>
    </span>
  </div>
</template>

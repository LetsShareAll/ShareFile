<script setup lang="ts">
import { ref } from 'vue';

import PreviewLoading from './PreviewLoading.vue';

type PreviewStatus = 'loading' | 'loaded' | 'error';

defineProps<{ fileUrl: string; name: string; mime?: string }>();

const status = ref<PreviewStatus>('loading');
const message = ref('正在加载 PDF...');

function onLoad(): void {
  status.value = 'loaded';
}

function onError(): void {
  status.value = 'error';
  message.value = '预览加载失败';
}
</script>

<template>
  <div
    class="preview-load-frame"
    :class="{
      'is-loading': status !== 'loaded',
      'is-loaded': status === 'loaded',
    }"
  >
    <PreviewLoading v-if="status !== 'loaded'" :message="message" />
    <iframe
      class="preview-load-target"
      style="width: 100%; height: 70vh; border: none"
      :src="fileUrl"
      title="PDF 预览"
      @load="onLoad"
      @error="onError"
    />
  </div>
</template>

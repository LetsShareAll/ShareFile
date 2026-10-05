<script setup lang="ts">
import { onMounted, ref } from 'vue';

import PreviewLoading from './PreviewLoading.vue';

type PreviewStatus = 'loading' | 'loaded' | 'error';

defineProps<{ fileUrl: string; name: string; mime?: string }>();

const imageEl = ref<HTMLImageElement | null>(null);
const status = ref<PreviewStatus>('loading');
const message = ref('正在加载图片...');

function onLoad(): void {
  status.value = 'loaded';
}

function onError(): void {
  status.value = 'error';
  message.value = '预览加载失败';
}

onMounted(() => {
  if (imageEl.value?.complete) status.value = 'loaded';
});
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
    <img
      ref="imageEl"
      class="preview-load-target"
      style="max-width: 100%; display: block; margin: 0 auto"
      :src="fileUrl"
      alt=""
      @load="onLoad"
      @error="onError"
    />
  </div>
</template>

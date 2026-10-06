<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import PreviewLoading from './PreviewLoading.vue';
import { useImageViewport } from './image/useImageViewport';

type PreviewStatus = 'loading' | 'loaded' | 'error';

const props = defineProps<{ fileUrl: string; name: string; mime?: string }>();

const frameEl = ref<HTMLDivElement | null>(null);
const imageEl = ref<HTMLImageElement | null>(null);
const status = ref<PreviewStatus>('loading');
const message = ref('正在加载图片...');

const viewport = useImageViewport({
  frameEl,
  imageEl,
  isReady: () => status.value === 'loaded',
});
const { percent, transform } = viewport;

function onLoad(): void {
  status.value = 'loaded';
  viewport.fit();
}

function onError(): void {
  status.value = 'error';
  message.value = '预览加载失败';
}

function resetView(): void {
  viewport.reset();
  status.value = 'loading';
  message.value = '正在加载图片...';
}

onMounted(() => {
  window.addEventListener('keydown', viewport.onKeydown);

  if (imageEl.value?.complete && (imageEl.value?.naturalWidth ?? 0) > 0) {
    onLoad();
  }
});

onBeforeUnmount(() =>
  window.removeEventListener('keydown', viewport.onKeydown),
);

watch(() => props.fileUrl, resetView);
</script>

<template>
  <div
    ref="frameEl"
    class="preview-load-frame image-preview-frame"
    :class="{
      'is-loading': status !== 'loaded',
      'is-loaded': status === 'loaded',
    }"
    @pointerdown="viewport.onPointerDown"
    @pointermove="viewport.onPointerMove"
    @pointerup="viewport.onPointerUp"
    @pointercancel="viewport.onPointerUp"
    @wheel.prevent="viewport.onWheel"
    @dblclick="viewport.onDoubleClick"
  >
    <PreviewLoading v-if="status !== 'loaded'" :message="message" />

    <div
      v-if="status === 'loaded'"
      class="image-preview-toolbar"
      role="toolbar"
      aria-label="图片缩放"
      @pointerdown.stop
      @pointerup.stop
      @click.stop
      @dblclick.stop
    >
      <button class="action-btn" aria-label="缩小" @click="viewport.zoomOut">
        −
      </button>
      <span class="image-preview-percent">{{ percent }}</span>
      <button class="action-btn" aria-label="放大" @click="viewport.zoomIn">
        ＋
      </button>
      <button class="action-btn" title="原始比例" @click="viewport.actualSize">
        1:1
      </button>
      <button class="action-btn" title="适应窗口" @click="viewport.fit">
        适应窗口
      </button>
    </div>

    <img
      ref="imageEl"
      class="preview-load-target image-preview-target"
      :style="{ transform }"
      :src="fileUrl"
      :alt="name"
      draggable="false"
      @load="onLoad"
      @error="onError"
    />
  </div>
</template>

<style scoped>
.image-preview-frame {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: min(70vh, 640px);
  overflow: hidden;
  touch-action: none;
  user-select: none;
  background: rgba(120, 120, 128, 0.06);
  border-radius: 10px;
}
.image-preview-target {
  max-width: none;
  transform-origin: center center;
}
.image-preview-toolbar {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem;
  background: rgba(20, 20, 24, 0.55);
  border-radius: 10px;
}
.image-preview-percent {
  min-width: 3.2rem;
  color: #fff;
  font-size: 0.85rem;
  text-align: center;
}
</style>

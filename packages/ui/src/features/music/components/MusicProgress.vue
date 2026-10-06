<script setup lang="ts">
import { computed, ref } from 'vue';

import { formatDuration } from '../track';

const props = defineProps<{ currentTime: number; duration: number }>();
const emit = defineEmits<{ seek: [seconds: number] }>();

// 拖拽期间用本地草稿值渲染，避免播放进度回写抢走滑块位置。
const dragging = ref(false);
const draft = ref(0);

const max = computed(() =>
  Number.isFinite(props.duration) && props.duration > 0 ? props.duration : 0,
);
const current = computed(() =>
  dragging.value ? draft.value : Math.min(props.currentTime, max.value),
);
const percent = computed(() =>
  max.value > 0 ? (current.value / max.value) * 100 : 0,
);

function onInput(event: Event): void {
  dragging.value = true;
  draft.value = Number((event.target as HTMLInputElement).value);
}

function commit(): void {
  if (!dragging.value) return;

  dragging.value = false;
  emit('seek', draft.value);
}
</script>

<template>
  <div class="music-bar-progress">
    <span class="music-bar-time">{{ formatDuration(current) }}</span>
    <input
      class="music-bar-seek"
      type="range"
      min="0"
      step="0.1"
      :max="max"
      :value="current"
      :style="{ '--music-progress': `${percent}%` }"
      aria-label="播放进度"
      @input="onInput"
      @change="commit"
    />
    <span class="music-bar-time is-total">{{ formatDuration(max) }}</span>
  </div>
</template>

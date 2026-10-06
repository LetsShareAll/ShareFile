<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  lines: { time: number; text: string }[];
  currentTime: number;
}>();

const listEl = ref<HTMLElement | null>(null);

const activeIndex = computed(() => {
  let index = -1;

  for (let position = 0; position < props.lines.length; position += 1) {
    if (props.lines[position].time <= props.currentTime) index = position;
  }

  return index;
});

function scrollToActive(index: number): void {
  if (index < 0) return;

  listEl.value?.children
    .item(index)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

watch(activeIndex, scrollToActive);
// 面板可能在播到中段时才打开：挂载后先对齐到当前歌词。
onMounted(() => scrollToActive(activeIndex.value));
</script>

<template>
  <div
    v-if="lines.length"
    ref="listEl"
    class="music-panel-lyrics"
    aria-label="歌词"
  >
    <p
      v-for="(line, index) in lines"
      :key="`${line.time}-${index}`"
      class="music-panel-lyric-row"
      :class="{ 'is-active': index === activeIndex }"
    >
      {{ line.text }}
    </p>
  </div>
  <p v-else class="music-panel-placeholder">暂无歌词</p>
</template>

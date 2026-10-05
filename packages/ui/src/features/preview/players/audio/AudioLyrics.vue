<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';

import { getActiveLyricIndex, type SyncedLyricLine } from './lyrics';

const props = defineProps<{
  lines: SyncedLyricLine[];
  audio: HTMLAudioElement | null;
}>();

const listEl = ref<HTMLElement | null>(null);
const activeIndex = ref(-1);
const dragging = ref(false);

let isDragging = false;
let suppressClick = false;
let dragStartY = 0;
let dragStartScrollTop = 0;
let removeSync: (() => void) | null = null;

function updateActiveLyric(): void {
  const { audio } = props;

  if (!audio) return;

  const nextIndex = getActiveLyricIndex(props.lines, audio.currentTime);

  if (nextIndex === activeIndex.value) return;

  activeIndex.value = nextIndex;

  if (nextIndex < 0 || isDragging) return;

  listEl.value?.children
    .item(nextIndex)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeLyricsSync(): void {
  removeSync?.();
  removeSync = null;
}

function bindLyricsSync(): void {
  const { audio } = props;

  if (!audio) return;

  removeLyricsSync();
  audio.addEventListener('timeupdate', updateActiveLyric);
  audio.addEventListener('seeked', updateActiveLyric);

  removeSync = () => {
    audio.removeEventListener('timeupdate', updateActiveLyric);
    audio.removeEventListener('seeked', updateActiveLyric);
  };

  updateActiveLyric();
}

function onPointerDown(event: PointerEvent): void {
  const list = listEl.value;

  if (!list || event.button !== 0) return;

  isDragging = true;
  suppressClick = false;
  dragging.value = true;
  dragStartY = event.clientY;
  dragStartScrollTop = list.scrollTop;
  list.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  const list = listEl.value;

  if (!isDragging || !list) return;

  const deltaY = event.clientY - dragStartY;

  if (Math.abs(deltaY) > 4) suppressClick = true;

  list.scrollTop = dragStartScrollTop - deltaY;
}

function stopDragging(event: PointerEvent): void {
  const list = listEl.value;

  if (!isDragging || !list) return;

  isDragging = false;
  dragging.value = false;

  if (list.hasPointerCapture(event.pointerId)) {
    list.releasePointerCapture(event.pointerId);
  }

  if (suppressClick) {
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
  }
}

function seekToLyric(index: number): void {
  if (suppressClick) {
    suppressClick = false;

    return;
  }

  const { audio } = props;
  const line = props.lines[index];

  if (!audio || !line) return;

  audio.currentTime = line.time;
  updateActiveLyric();
}

watch(
  () => props.audio,
  () => {
    removeLyricsSync();
    bindLyricsSync();
  },
  { immediate: true },
);

watch(() => props.lines, updateActiveLyric);

onUnmounted(removeLyricsSync);
</script>

<template>
  <section class="amplitude-preview-lyrics" :hidden="lines.length === 0">
    <div class="amplitude-preview-lyrics-title">歌词</div>
    <div
      ref="listEl"
      class="amplitude-preview-lyrics-list"
      :class="{ dragging }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="stopDragging"
      @pointercancel="stopDragging"
    >
      <div
        v-for="(line, index) in lines"
        :key="`${line.time}-${index}`"
        class="amplitude-preview-lyric-row"
        :class="{ active: index === activeIndex }"
        :data-time="line.time"
        @click="seekToLyric(index)"
      >
        <span class="amplitude-preview-lyric-text">{{ line.lyric }}</span>
        <span
          v-if="line.translation"
          class="amplitude-preview-lyric-translation"
        >
          {{ line.translation }}
        </span>
      </div>
    </div>
  </section>
</template>

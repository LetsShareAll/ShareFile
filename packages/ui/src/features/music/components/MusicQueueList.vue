<script setup lang="ts">
import { onUnmounted, ref } from 'vue';

import { resolveMoveTarget } from '../queueOrder';
import { getTrackDisplay } from '../trackDisplay';
import type { MusicTrack } from '../track';

const props = defineProps<{ tracks: MusicTrack[]; currentId?: string }>();
const emit = defineEmits<{
  select: [track: MusicTrack];
  remove: [id: string];
  clear: [];
  move: [from: number, to: number];
}>();

/** 起拖阈值：位移小于它算点按，触摸才不会一碰就换位。 */
const DRAG_SLOP = 6;

const listEl = ref<HTMLUListElement | null>(null);
const dragFrom = ref(-1);
const dropIndex = ref(-1);
const dragging = ref(false);

let pointerId = -1;
let startY = 0;
let moved = false;

function midpoints(): number[] {
  const items = listEl.value?.children;

  if (!items) return [];

  return Array.from(items, item => {
    const rect = item.getBoundingClientRect();

    return rect.top + rect.height / 2;
  });
}

function finish(): void {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  pointerId = -1;
  moved = false;
  dragging.value = false;
  dragFrom.value = -1;
  dropIndex.value = -1;
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return;
  if (!moved && Math.abs(event.clientY - startY) < DRAG_SLOP) return;

  moved = true;
  dragging.value = true;
  dropIndex.value = resolveMoveTarget(
    midpoints(),
    event.clientY,
    dragFrom.value,
  );
}

function onPointerUp(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return;

  const from = dragFrom.value;
  const to = dropIndex.value;
  // finish() 会把 moved 清掉，先留一份再收尾。
  const dropped = moved;

  finish();

  if (dropped && to >= 0 && to !== from) emit('move', from, to);
}

/** 拖动只在手柄上启动：列表本身照常滚动（手柄的 touch-action 见样式）。 */
function onHandlePointerDown(event: PointerEvent, index: number): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  pointerId = event.pointerId;
  startY = event.clientY;
  moved = false;
  dragFrom.value = index;
  dropIndex.value = index;

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function onHandleKeydown(event: KeyboardEvent, index: number): void {
  if (!event.altKey) return;

  const to =
    event.key === 'ArrowUp'
      ? index - 1
      : event.key === 'ArrowDown'
        ? index + 1
        : -1;

  if (to < 0 || to >= props.tracks.length) return;

  event.preventDefault();
  emit('move', index, to);
}

onUnmounted(finish);
</script>

<template>
  <section class="music-panel-queue" aria-label="播放队列">
    <div class="music-panel-section-head">
      <span>队列（{{ tracks.length }}）</span>
      <button
        class="music-panel-text-btn"
        type="button"
        :disabled="tracks.length === 0"
        @click="emit('clear')"
      >
        清空队列
      </button>
    </div>
    <ul v-if="tracks.length" ref="listEl" class="music-panel-list">
      <li
        v-for="(track, index) in tracks"
        :key="track.id"
        class="music-panel-item"
        :class="{
          'is-current': track.id === currentId,
          'is-dragging': dragging && index === dragFrom,
          'is-drop-target': dragging && index === dropIndex,
        }"
      >
        <button
          class="music-queue-handle"
          type="button"
          data-drag-handle
          :aria-label="`拖动排序 ${track.name}`"
          title="拖动排序（Alt + ↑/↓ 也可移动）"
          @pointerdown="onHandlePointerDown($event, index)"
          @keydown="onHandleKeydown($event, index)"
        >
          <i class="fas fa-grip-vertical" aria-hidden="true" />
        </button>
        <button
          class="music-panel-item-btn"
          type="button"
          :title="track.name"
          @click="emit('select', track)"
        >
          <span class="music-panel-item-name">
            {{ getTrackDisplay(track).title }}
          </span>
          <span class="music-panel-item-sub">
            {{ getTrackDisplay(track).artist || track.path }}
          </span>
        </button>
        <button
          class="music-panel-remove"
          type="button"
          :aria-label="`从队列移除 ${track.name}`"
          title="从队列移除"
          @click="emit('remove', track.id)"
        >
          <i class="fas fa-xmark" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-else class="music-panel-placeholder">队列为空</p>
  </section>
</template>

<style scoped src="./musicList.css"></style>

<style scoped>
.music-panel-queue {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}
.music-queue-handle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.6rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.7rem;
  cursor: grab;
  /* 触摸从手柄起拖，拖动时页面 / 列表不跟着滚。 */
  touch-action: none;
}
.music-queue-handle:hover {
  color: var(--text);
}
.music-panel-item.is-dragging {
  opacity: 0.55;
}
.music-panel-item.is-dragging .music-queue-handle {
  cursor: grabbing;
}
/* 落点提示：最终下标那一项的上沿亮一条。 */
.music-panel-item.is-drop-target {
  box-shadow: inset 0 2px 0 var(--primary);
}
.music-panel-remove {
  flex: none;
  width: 1.6rem;
  height: 1.6rem;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
}
.music-panel-remove:hover {
  background: var(--button-hover-bg);
  color: var(--text);
}
</style>

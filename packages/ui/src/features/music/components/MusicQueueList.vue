<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { useQueueDrag } from '../useQueueDrag';
import { useTrackInfo } from '../useTrackInfo';
import { getTrackDisplay } from '../trackDisplay';
import { formatDuration, type MusicTrack } from '../track';

const props = defineProps<{ tracks: MusicTrack[]; currentId?: string }>();
const emit = defineEmits<{
  select: [track: MusicTrack];
  remove: [id: string];
  clear: [];
  move: [from: number, to: number];
}>();

const listEl = ref<HTMLUListElement | null>(null);

const { dragging, dragFrom, dropIndex, onPointerDown, onKeydown } =
  useQueueDrag({
    list: listEl,
    count: () => props.tracks.length,
    onMove: (from, to) => emit('move', from, to),
  });

const { getTrackInfo, requestTrackInfo } = useTrackInfo();

/** 面板打开（组件挂载）时才发起解析；队列或当前曲目变了再补一轮。 */
function requestVisible(): void {
  for (const track of props.tracks) void requestTrackInfo(track);
}

onMounted(requestVisible);
watch(() => props.tracks, requestVisible);
watch(() => props.currentId, requestVisible);

/** 行视图：文件名解析出的显示名 + 懒解析出来的时长与封面。 */
const rows = computed(() =>
  props.tracks.map(track => {
    const info = getTrackInfo(track);
    const display = getTrackDisplay(track);

    return {
      track,
      title: display.title,
      sub: display.artist || track.path,
      duration: formatDuration(info.duration ?? Number.NaN),
      coverUrl: info.coverUrl,
    };
  }),
);
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
        v-for="(row, index) in rows"
        :key="row.track.id"
        class="music-panel-item"
        :class="{
          'is-current': row.track.id === currentId,
          'is-dragging': dragging && index === dragFrom,
          'is-drop-target': dragging && index === dropIndex,
        }"
      >
        <button
          class="music-queue-handle"
          type="button"
          data-drag-handle
          :aria-label="`拖动排序 ${row.track.name}`"
          title="拖动排序（Alt + ↑/↓ 也可移动）"
          @pointerdown="onPointerDown($event, index)"
          @keydown="onKeydown($event, index)"
        >
          <i class="fas fa-grip-vertical" aria-hidden="true" />
        </button>
        <span class="music-queue-thumb" data-track-thumb>
          <img v-if="row.coverUrl" :src="row.coverUrl" alt="" />
          <i v-else class="fas fa-music" aria-hidden="true" />
        </span>
        <button
          class="music-panel-item-btn"
          type="button"
          :title="row.track.name"
          @click="emit('select', row.track)"
        >
          <span class="music-panel-item-name">{{ row.title }}</span>
          <span class="music-panel-item-sub">{{ row.sub }}</span>
        </button>
        <span class="music-queue-duration" data-track-duration>
          {{ row.duration }}
        </span>
        <button
          class="music-panel-remove"
          type="button"
          :aria-label="`从队列移除 ${row.track.name}`"
          title="从队列移除"
          @click="emit('remove', row.track.id)"
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
/* 缩略图沿用面板封面的配方，只是缩到列表这一档（32×32）。 */
.music-queue-thumb {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-sm);
  background: var(--button-bg);
  color: var(--text-secondary);
  font-size: 0.8rem;
}
.music-queue-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.music-queue-duration {
  flex: none;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  font-size: 0.72rem;
}
.music-panel-item.is-current .music-queue-duration {
  color: inherit;
  opacity: 0.75;
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

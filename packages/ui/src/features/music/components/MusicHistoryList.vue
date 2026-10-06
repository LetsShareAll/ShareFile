<script setup lang="ts">
import { getTrackDisplay } from '../trackDisplay';
import type { MusicHistoryEntry } from '../track';

defineProps<{ entries: MusicHistoryEntry[] }>();
const emit = defineEmits<{ replay: [entry: MusicHistoryEntry] }>();

function formatPlayedAt(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { hour12: false });
}
</script>

<template>
  <section class="music-panel-history" aria-label="播放历史">
    <div class="music-panel-section-head">
      <span>历史（{{ entries.length }}）</span>
    </div>
    <ul v-if="entries.length" class="music-panel-list">
      <li
        v-for="entry in entries"
        :key="`${entry.id}-${entry.playedAt}`"
        class="music-panel-item"
      >
        <div class="music-panel-item-btn" :title="entry.name">
          <span class="music-panel-item-name">
            {{ getTrackDisplay(entry).title }}
          </span>
          <span class="music-panel-item-sub">
            {{ getTrackDisplay(entry).artist || entry.path }} ·
            {{ formatPlayedAt(entry.playedAt) }}
          </span>
        </div>
        <button
          class="music-panel-text-btn"
          type="button"
          :aria-label="`回放 ${entry.name}`"
          @click="emit('replay', entry)"
        >
          回放
        </button>
      </li>
    </ul>
    <p v-else class="music-panel-placeholder">暂无播放历史</p>
  </section>
</template>

<style scoped src="./musicList.css"></style>

<style scoped>
.music-panel-history {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}
</style>

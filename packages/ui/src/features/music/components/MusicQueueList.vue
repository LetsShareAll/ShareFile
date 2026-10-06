<script setup lang="ts">
import type { MusicTrack } from '../track';

defineProps<{ tracks: MusicTrack[]; currentId?: string }>();
const emit = defineEmits<{
  select: [track: MusicTrack];
  remove: [id: string];
  clear: [];
}>();
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
    <ul v-if="tracks.length" class="music-panel-list">
      <li
        v-for="track in tracks"
        :key="track.id"
        class="music-panel-item"
        :class="{ 'is-current': track.id === currentId }"
      >
        <button
          class="music-panel-item-btn"
          type="button"
          :title="track.name"
          @click="emit('select', track)"
        >
          <span class="music-panel-item-name">{{ track.name }}</span>
          <span class="music-panel-item-sub">{{ track.path }}</span>
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

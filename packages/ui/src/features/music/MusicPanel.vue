<script setup lang="ts">
import { computed } from 'vue';

import { useMusicStore } from '../../stores/music';
import type { MusicHistoryEntry, MusicTrack } from './track';
import MusicArtwork from './components/MusicArtwork.vue';
import MusicHistoryList from './components/MusicHistoryList.vue';
import MusicLyrics from './components/MusicLyrics.vue';
import MusicModeButton from './components/MusicModeButton.vue';
import MusicQueueList from './components/MusicQueueList.vue';

const music = useMusicStore();

const lyrics = computed(() => music.metadata.lyrics ?? []);
const title = computed(
  () => music.metadata.title || music.currentTrack?.name || '未在播放',
);
const artist = computed(() => music.metadata.artist || '未知艺术家');
const artworkAlt = computed(() => `${title.value} 封面`);
const toggleLabel = computed(() => (music.isPlaying ? '暂停' : '播放'));
const statusText = computed(() => (music.isPlaying ? '正在播放' : '已暂停'));

function toggle(): void {
  void music.toggle();
}

function selectTrack(track: MusicTrack): void {
  void music.playTrack(track, music.queue);
}

function replay(entry: MusicHistoryEntry): void {
  void music.playFromHistory(entry);
}
</script>

<template>
  <div
    v-if="music.expanded"
    class="music-panel"
    role="dialog"
    aria-label="音乐播放面板"
  >
    <div class="music-panel-shell">
      <header class="music-panel-header">
        <span class="music-panel-heading">音乐播放器</span>
        <button
          class="music-panel-btn"
          type="button"
          aria-label="收起播放面板"
          title="收起播放面板"
          @click="music.toggleExpanded()"
        >
          <i class="fas fa-chevron-down" aria-hidden="true" />
        </button>
      </header>
      <div class="music-panel-body">
        <section class="music-panel-now">
          <MusicArtwork
            :src="music.metadata.coverUrl"
            :alt="artworkAlt"
            variant="panel"
          />
          <div>
            <div class="music-panel-track-title">{{ title }}</div>
            <div class="music-panel-track-sub">{{ artist }}</div>
            <div v-if="music.metadata.album" class="music-panel-track-sub">
              {{ music.metadata.album }}
            </div>
          </div>
          <div class="music-panel-controls">
            <MusicModeButton
              :mode="music.mode"
              variant="panel"
              @select="music.setMode($event)"
            />
            <button
              class="music-panel-btn"
              type="button"
              aria-label="上一首"
              title="上一首"
              @click="music.prev()"
            >
              <i class="fas fa-backward-step" aria-hidden="true" />
            </button>
            <button
              class="music-panel-btn music-panel-play"
              type="button"
              :aria-label="toggleLabel"
              :title="toggleLabel"
              @click="toggle"
            >
              <i
                class="fas"
                :class="music.isPlaying ? 'fa-pause' : 'fa-play'"
                aria-hidden="true"
              />
            </button>
            <button
              class="music-panel-btn"
              type="button"
              aria-label="下一首"
              title="下一首"
              @click="music.next()"
            >
              <i class="fas fa-forward-step" aria-hidden="true" />
            </button>
          </div>
          <p class="music-panel-track-sub">{{ statusText }}</p>
          <p v-if="music.error" class="music-panel-error">{{ music.error }}</p>
          <MusicLyrics :lines="lyrics" :current-time="music.currentTime" />
        </section>
        <div class="music-panel-lists">
          <MusicQueueList
            :tracks="music.queue"
            :current-id="music.currentTrack?.id"
            @select="selectTrack"
            @remove="music.removeFromQueue($event)"
            @clear="music.clearQueue()"
          />
          <MusicHistoryList :entries="music.history" @replay="replay" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';

import { useMusicStore } from '../../stores/music';
import MusicArtwork from './components/MusicArtwork.vue';
import MusicModeButton from './components/MusicModeButton.vue';
import MusicProgress from './components/MusicProgress.vue';

const music = useMusicStore();

const title = computed(
  () => music.metadata.title || music.currentTrack?.name || '',
);
const artist = computed(() => music.metadata.artist || '未知艺术家');
const artworkAlt = computed(() => `${title.value} 封面`);
const toggleLabel = computed(() => (music.isPlaying ? '暂停' : '播放'));
const expandLabel = computed(() =>
  music.expanded ? '收起播放面板' : '展开播放面板',
);

function toggle(): void {
  void music.toggle();
}

function onVolume(event: Event): void {
  music.setVolume(Number((event.target as HTMLInputElement).value));
}

/** 空格切换播放：输入框 / 可编辑区内的空格照旧交给控件本身。 */
function onKeydown(event: KeyboardEvent): void {
  if (event.code !== 'Space' && event.key !== ' ') return;

  const target = event.target;

  if (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable]')
  ) {
    return;
  }

  if (!music.currentTrack) return;

  event.preventDefault();
  toggle();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div
    v-if="music.currentTrack"
    class="music-bar"
    :data-playing="music.isPlaying"
    role="region"
    aria-label="音乐播放器"
  >
    <MusicArtwork
      :src="music.metadata.coverUrl"
      :alt="artworkAlt"
      variant="bar"
    />
    <div class="music-bar-meta">
      <span class="music-bar-title" :title="title">{{ title }}</span>
      <span class="music-bar-artist">{{ artist }}</span>
    </div>
    <div class="music-bar-controls">
      <button
        class="music-bar-btn"
        type="button"
        aria-label="上一首"
        title="上一首"
        @click="music.prev()"
      >
        <i class="fas fa-backward-step" aria-hidden="true" />
      </button>
      <button
        class="music-bar-btn music-bar-play"
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
        class="music-bar-btn"
        type="button"
        aria-label="下一首"
        title="下一首"
        @click="music.next()"
      >
        <i class="fas fa-forward-step" aria-hidden="true" />
      </button>
    </div>
    <MusicProgress
      :current-time="music.currentTime"
      :duration="music.duration"
      @seek="music.seek($event)"
    />
    <div class="music-bar-volume">
      <i class="fas fa-volume-high" aria-hidden="true" />
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="music.volume"
        aria-label="音量"
        @input="onVolume"
      />
    </div>
    <MusicModeButton
      :mode="music.mode"
      variant="bar"
      @select="music.setMode($event)"
    />
    <button
      class="music-bar-btn"
      type="button"
      :aria-label="expandLabel"
      :title="expandLabel"
      @click="music.toggleExpanded()"
    >
      <i
        class="fas"
        :class="music.expanded ? 'fa-chevron-down' : 'fa-chevron-up'"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

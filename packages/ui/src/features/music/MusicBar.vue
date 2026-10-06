<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';

import { useMusicStore } from '../../stores/music';
import MusicArtwork from './components/MusicArtwork.vue';
import MusicModeButton from './components/MusicModeButton.vue';
import MusicProgress from './components/MusicProgress.vue';
import { getTrackDisplay } from './trackDisplay';
import { useFloater } from './useFloater';

const music = useMusicStore();
const {
  rootEl,
  cardEl,
  rootStyle,
  docked,
  dragging,
  open,
  onEnter,
  onLeave,
  onCardPointerDown,
  onHandlePointerDown,
  onHandleClick,
} = useFloater();

/** 内嵌元信息优先；没有就按文件名解析出的标题显示。 */
const title = computed(() => {
  const track = music.currentTrack;

  return music.metadata.title || (track ? getTrackDisplay(track).title : '');
});
const artist = computed(() => music.metadata.artist || '未知艺术家');
const artworkAlt = computed(() => `${title.value} 封面`);
const toggleLabel = computed(() => (music.isPlaying ? '暂停' : '播放'));
const expandLabel = computed(() =>
  music.expanded ? '收起播放面板' : '展开播放面板',
);
const handleLabel = computed(() => {
  const side = docked.value === 'left' ? '左' : '右';

  return `音乐播放器，已停靠在${side}侧，${open.value ? '按回车收起' : '按回车展开'}`;
});

function toggle(): void {
  void music.toggle();
}

function onVolume(event: Event): void {
  music.setVolume(Number((event.target as HTMLInputElement).value));
}

/**
 * 空格切换播放：输入框 / 可编辑区内的空格照旧交给控件本身；
 * 悬浮卡里的按钮自己处理空格（把手的展开、播放键的点按），不再叠一次全局切换。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.code !== 'Space' && event.key !== ' ') return;

  const target = event.target;

  if (
    target instanceof HTMLElement &&
    target.closest(
      'input, textarea, select, [contenteditable], .music-bar button',
    )
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
    ref="rootEl"
    class="music-bar"
    :class="{
      'is-docked': docked !== null,
      'is-open': open,
      'is-dragging': dragging,
    }"
    :data-docked="docked"
    :data-playing="music.isPlaying"
    :style="rootStyle"
    role="region"
    aria-label="音乐播放器"
    @pointerenter="onEnter"
    @pointerleave="onLeave"
  >
    <div ref="cardEl" class="music-bar-card" @pointerdown="onCardPointerDown">
      <div class="music-bar-head">
        <MusicArtwork
          :src="music.metadata.coverUrl"
          :alt="artworkAlt"
          variant="bar"
        />
        <div class="music-bar-meta">
          <span class="music-bar-title" :title="title">{{ title }}</span>
          <span class="music-bar-artist">{{ artist }}</span>
        </div>
      </div>
      <div class="music-bar-row">
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
          :duration="music.displayDuration"
          @seek="music.seek($event)"
        />
      </div>
      <div class="music-bar-row is-tail">
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
      <span class="music-bar-grip" data-drag-handle aria-hidden="true" />
    </div>
    <button
      v-if="docked"
      class="music-floater-handle"
      type="button"
      data-drag-handle
      :aria-label="handleLabel"
      :title="handleLabel"
      :aria-expanded="open"
      @pointerdown="onHandlePointerDown"
      @click="onHandleClick"
    >
      <MusicArtwork :src="music.metadata.coverUrl" alt="" variant="bar" />
      <span class="music-floater-badge">
        <i
          class="fas"
          :class="music.isPlaying ? 'fa-pause' : 'fa-play'"
          aria-hidden="true"
        />
      </span>
    </button>
  </div>
</template>

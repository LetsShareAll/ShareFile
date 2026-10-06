<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';

import {
  getCurlCommand,
  getNodeFileUrl,
  getNodePageUrl,
} from '../../domain/links';
import type { ShareNode } from '../../domain/share-file';
import { RESTRICTED_NOTICE } from '../../domain/share-file/restricted';
import { copyText } from '../../platform/clipboard';
import { useMusicStore } from '../../stores/music';
import type { MusicHistoryEntry, MusicTrack } from './track';
import MusicArtwork from './components/MusicArtwork.vue';
import MusicHistoryList from './components/MusicHistoryList.vue';
import MusicLyrics from './components/MusicLyrics.vue';
import MusicModeButton from './components/MusicModeButton.vue';
import MusicQueueList from './components/MusicQueueList.vue';

type ShareKind = 'page' | 'direct' | 'curl';

const music = useMusicStore();

const lyrics = computed(() => music.metadata.lyrics ?? []);
const title = computed(
  () => music.metadata.title || music.currentTrack?.name || '未在播放',
);
const artist = computed(() => music.metadata.artist || '未知艺术家');
const artworkAlt = computed(() => `${title.value} 封面`);
const toggleLabel = computed(() => (music.isPlaying ? '暂停' : '播放'));
// 受限曲目不提供分享入口（仍可播放：静态站点拦不住直接访问，这不是安全边界）。
const restricted = computed(() => music.currentTrack?.restricted === true);
const shareTitle = computed(() =>
  restricted.value ? RESTRICTED_NOTICE : undefined,
);
const statusText = computed(() => (music.isPlaying ? '正在播放' : '已暂停'));

/** 分享目标与列表卡片 / 预览页脚同义：绝对页面深链、直链、curl 命令。 */
const shareLinks = computed<Record<ShareKind, string> | null>(() => {
  const track = music.currentTrack;

  if (!track) return null;

  // getNodeFileUrl 只认节点的 id / url：直链优先索引里的真实地址，缺了退回站内路径。
  const node: ShareNode = {
    id: track.path || track.id,
    name: track.name,
    type: 'file',
    parent: null,
    children: [],
    url: track.url,
    size: track.size,
  };
  const fileUrl = getNodeFileUrl(node);

  return {
    page: new URL(getNodePageUrl(track.path), window.location.origin).href,
    direct: fileUrl,
    curl: getCurlCommand(fileUrl),
  };
});

const copied = ref<ShareKind | null>(null);
let copiedTimer: number | undefined;

async function copyShare(kind: ShareKind): Promise<void> {
  const links = shareLinks.value;

  if (!links || !(await copyText(links[kind]))) return;

  copied.value = kind;
  window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    copied.value = null;
  }, 1500);
}

onUnmounted(() => window.clearTimeout(copiedTimer));

function toggle(): void {
  void music.toggle();
}

function selectTrack(track: MusicTrack): void {
  void music.playTrack(track, music.queue);
}

function replay(entry: MusicHistoryEntry): void {
  void music.playFromHistory(entry);
}

function move(from: number, to: number): void {
  music.moveInQueue(from, to);
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
          <div
            v-if="shareLinks"
            class="music-panel-share"
            role="group"
            aria-label="分享当前曲目"
          >
            <button
              class="music-panel-share-btn"
              :class="{ 'is-copied': copied === 'page' }"
              type="button"
              :disabled="restricted"
              :title="shareTitle ?? '复制页面链接'"
              aria-label="复制页面链接"
              @click="copyShare('page')"
            >
              <i class="fas fa-link" aria-hidden="true" />
              {{ copied === 'page' ? '已复制' : '页面链接' }}
            </button>
            <button
              class="music-panel-share-btn"
              :class="{ 'is-copied': copied === 'direct' }"
              type="button"
              :disabled="restricted"
              :title="shareTitle ?? '复制直链'"
              aria-label="复制直链"
              @click="copyShare('direct')"
            >
              <i class="fas fa-copy" aria-hidden="true" />
              {{ copied === 'direct' ? '已复制' : '直链' }}
            </button>
            <button
              class="music-panel-share-btn"
              :class="{ 'is-copied': copied === 'curl' }"
              type="button"
              :disabled="restricted"
              :title="shareTitle ?? '复制 curl 命令'"
              aria-label="复制 curl 命令"
              @click="copyShare('curl')"
            >
              <i class="fas fa-terminal" aria-hidden="true" />
              {{ copied === 'curl' ? '已复制' : 'curl' }}
            </button>
          </div>
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
            @move="move"
          />
          <MusicHistoryList :entries="music.history" @replay="replay" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 全屏遮罩：面板自己的定位与骨架，玻璃配方来自 base.css 的 .music-panel-shell。 */
.music-panel {
  position: fixed;
  inset: 0;
  z-index: 1102;
  display: flex;
  padding: 1rem;
  background: var(--modal-overlay-bg);
  backdrop-filter: var(--glass-blur-subtle);
  -webkit-backdrop-filter: var(--glass-blur-subtle);
}
.music-panel-shell {
  display: flex;
  flex-direction: column;
  width: min(100%, 58rem);
  max-height: 100%;
  margin: auto;
  overflow: hidden;
  color: var(--text);
}
.music-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid var(--card-border);
}
.music-panel-heading {
  font-size: 0.95rem;
  font-weight: 600;
}
.music-panel-body {
  display: grid;
  grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
  gap: 1rem;
  padding: 1rem;
  overflow: auto;
}
.music-panel-now {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  text-align: center;
}
.music-panel-track-title {
  font-size: 1rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.music-panel-track-sub {
  color: var(--text-secondary);
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}
.music-panel-controls {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
/* 分享：与列表卡片 / 预览页脚同一套动作，只是收成面板宽度里的一行小胶囊。 */
.music-panel-share {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}
.music-panel-share-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 1.8rem;
  padding: 0 0.6rem;
  border: 1px solid var(--card-border);
  border-radius: 999px;
  background: var(--button-bg);
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  transition:
    background var(--duration-normal) var(--ease-standard),
    color var(--duration-normal) var(--ease-standard);
}
.music-panel-share-btn:hover {
  background: var(--button-hover-bg);
  color: var(--text);
}
.music-panel-share-btn.is-copied {
  border-color: var(--primary);
  color: var(--primary);
}
.music-panel-error {
  color: var(--color-audio);
  font-size: 0.78rem;
}
.music-panel-lists {
  display: grid;
  align-content: start;
  gap: 1rem;
  min-width: 0;
}
/* 面板自己的按钮：悬浮卡那套 .music-bar-btn 留在全局（首屏要用）。 */
.music-panel-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text);
  font-size: 0.9rem;
  cursor: pointer;
  transition:
    background var(--duration-normal) var(--ease-standard),
    color var(--duration-normal) var(--ease-standard);
}
.music-panel-btn:hover {
  background: var(--button-hover-bg);
}
.music-panel-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.music-panel-play {
  width: 2.4rem;
  height: 2.4rem;
  font-size: 1rem;
  background: var(--button-bg);
}
@media (max-width: 720px) {
  .music-panel-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

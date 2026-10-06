<script setup lang="ts">
import { computed, onMounted } from 'vue';

import { getNodeFileUrl } from '../../../domain/links';
import { useLibraryStore } from '../../../stores/library';
import { useMusicStore } from '../../../stores/music';
import { usePreviewStore } from '../../../stores/preview';
import { buildQueueFromDirectory } from '../../music/track';
import AudioLyrics from './audio/AudioLyrics.vue';
import { buildMetaRows } from './audio/metaRows';

const props = defineProps<{ fileUrl: string; name: string; mime?: string }>();

const preview = usePreviewStore();
const library = useLibraryStore();
const music = useMusicStore();

const isCurrent = computed(() => music.currentTrack?.id === preview.node?.id);
const title = computed(
  () => music.metadata.title || music.currentTrack?.name || props.name,
);
const artist = computed(() => music.metadata.artist || '未知艺术家');
const artworkAlt = computed(() => `${title.value} 封面`);
const lyrics = computed(() =>
  (music.metadata.lyrics ?? []).map(line => ({
    time: line.time,
    lyric: line.text,
  })),
);
const metaRows = computed(() =>
  buildMetaRows({
    title: music.metadata.title,
    artist: music.metadata.artist,
    album: music.metadata.album,
    lyrics: lyrics.value,
    hasCommonTags: false,
  }),
);
const statusText = computed(() => {
  if (music.error) return `播放失败：${music.error}`;
  if (!isCurrent.value) return '正在转交底部全局播放器...';

  return music.isPlaying ? '全局播放器中正在播放' : '已在全局播放器中暂停';
});

/** 弹窗关闭后仍要继续播放：这里只把当前目录的音频队列交给全局播放器。 */
onMounted(() => {
  const node = preview.node;

  if (!node || music.currentTrack?.id === node.id) return;

  const queue = buildQueueFromDirectory(
    preview.navigation,
    nodeId => library.getNodePathById(nodeId),
    getNodeFileUrl,
  );

  if (!queue.some(track => track.id === node.id)) return;

  void music.playTracks(queue, node.id);
});
</script>

<template>
  <div class="amplitude-preview">
    <div class="amplitude-preview-main">
      <div class="amplitude-preview-artwork">
        <img
          v-if="music.metadata.coverUrl"
          :src="music.metadata.coverUrl"
          :alt="artworkAlt"
        />
        <i v-else class="fas fa-music" />
      </div>
      <div class="amplitude-preview-details">
        <div class="amplitude-preview-header">
          <strong class="amplitude-preview-title">{{ title }}</strong>
          <span class="amplitude-preview-artist">{{ artist }}</span>
          <span class="amplitude-preview-status">{{ statusText }}</span>
        </div>
        <dl class="amplitude-preview-meta">
          <div
            v-for="row in metaRows"
            :key="row.label"
            class="amplitude-preview-meta-row"
          >
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
        <p class="amplitude-preview-status">
          播放控制已移至底部播放条，关闭弹窗不会中断播放。
        </p>
      </div>
    </div>
    <AudioLyrics :lines="lyrics" :audio="null" />
  </div>
</template>

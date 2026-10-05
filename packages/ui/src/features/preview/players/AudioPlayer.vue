<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import AudioLyrics from './audio/AudioLyrics.vue';
import { parseAudioTitle } from './audio/format';
import { buildMetaRows } from './audio/metaRows';
import {
  isUsableAudioUrl,
  readAudioMetadata,
  type AudioPreviewMetadata,
} from './audio/metadata';

type AmplitudeApi = (typeof import('amplitudejs'))['default'];

const props = defineProps<{ fileUrl: string; name: string; mime?: string }>();

const fileUrl = props.fileUrl.trim();
const song = { ...parseAudioTitle(props.name), url: fileUrl };
const usable = isUsableAudioUrl(fileUrl);

const metadata = ref<AudioPreviewMetadata | null>(null);
const statusText = ref(
  usable ? '正在读取内嵌元数据...' : '音频地址无效，无法加载播放器',
);
const coverUrl = ref<string | undefined>(undefined);
const audioEl = ref<HTMLAudioElement | null>(null);

let amplitude: AmplitudeApi | null = null;
let controller: AbortController | null = null;
let disposed = false;

const lyrics = computed(() => metadata.value?.lyrics ?? []);
const title = computed(() => metadata.value?.title || song.name);
const artist = computed(() => metadata.value?.artist || '未知艺术家');
const coverAlt = computed(
  () => `${metadata.value?.album || metadata.value?.title || props.name} 封面`,
);
const metaRows = computed(() =>
  metadata.value ? buildMetaRows(metadata.value) : [],
);

async function loadMetadata(): Promise<void> {
  controller = new AbortController();

  try {
    const info = await readAudioMetadata(
      fileUrl,
      props.mime,
      song,
      controller.signal,
    );

    if (disposed) {
      if (info.coverUrl) URL.revokeObjectURL(info.coverUrl);

      return;
    }

    metadata.value = info;
    coverUrl.value = info.coverUrl;
    statusText.value =
      info.lyrics.length > 0
        ? '已读取内嵌元数据和同步歌词'
        : info.hasCommonTags
          ? '已读取内嵌元数据'
          : '未找到内嵌标签，已读取音频流信息';
  } catch {
    if (!disposed && !controller.signal.aborted) {
      statusText.value = '未能读取内嵌元数据';
    }
  }
}

onMounted(async () => {
  if (!usable) return;

  const { default: Amplitude } = await import('amplitudejs');

  if (disposed) return;

  amplitude = Amplitude;
  Amplitude.init({ preload: 'metadata', songs: [song] });
  audioEl.value = Amplitude.getAudio();
  void loadMetadata();
});

onUnmounted(() => {
  disposed = true;
  controller?.abort();
  controller = null;

  const audio = amplitude?.getAudio();

  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  if (coverUrl.value) URL.revokeObjectURL(coverUrl.value);

  coverUrl.value = undefined;
});
</script>

<template>
  <div class="amplitude-preview">
    <div class="amplitude-preview-main">
      <div class="amplitude-preview-artwork">
        <img v-if="coverUrl" :src="coverUrl" :alt="coverAlt" />
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
        <div class="amplitude-preview-controls">
          <button
            class="amplitude-play-pause amplitude-preview-play"
            type="button"
            data-amplitude-song-index="0"
            :disabled="!usable"
          >
            <i class="fas fa-play" />
            <i class="fas fa-pause" />
          </button>
          <div class="amplitude-preview-timeline">
            <span class="amplitude-current-time" data-amplitude-song-index="0">
              00:00
            </span>
            <input
              class="amplitude-song-slider"
              data-amplitude-song-index="0"
              type="range"
              min="0"
              max="100"
              :value="0"
              :disabled="!usable"
            />
            <span class="amplitude-duration-time" data-amplitude-song-index="0">
              00:00
            </span>
          </div>
        </div>
      </div>
    </div>
    <AudioLyrics :lines="lyrics" :audio="audioEl" />
  </div>
</template>

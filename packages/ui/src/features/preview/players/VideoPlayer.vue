<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import 'video.js/dist/video-js.css';

import PreviewLoading from '../renderers/PreviewLoading.vue';
import { bindVideoKeyboardControls, type VideoJsPlayer } from './videoControls';

const props = defineProps<{ fileUrl: string; name: string; mime?: string }>();

const frameEl = ref<HTMLElement | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const loaded = ref(false);
const message = ref('正在加载视频...');

let player: VideoJsPlayer | null = null;
let removeKeyboardControls: (() => void) | null = null;

async function initPlayer(): Promise<void> {
  const [{ default: videojs }, { default: zhCN }] = await Promise.all([
    import('video.js'),
    import('video.js/dist/lang/zh-CN.json'),
  ]);
  const video = videoEl.value;
  const frame = frameEl.value;

  if (!video || !frame) return;

  videojs.addLanguage('zh-CN', zhCN);

  const instance = videojs(video, {
    controls: true,
    fluid: true,
    html5: {
      nativeAudioTracks: true,
      nativeVideoTracks: true,
      vhs: { overrideNative: false },
    },
    language: 'zh-CN',
    muted: false,
    playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
    preload: 'metadata',
    responsive: true,
    sources: [{ src: props.fileUrl, type: props.mime || 'video/mp4' }],
    techOrder: ['html5'],
  });

  player = instance;
  instance.ready(() => {
    player?.muted(false);
    player?.volume(1);
    frame.focus();
  });
  instance.one('loadedmetadata', () => {
    loaded.value = true;
  });
  instance.one('error', () => {
    message.value = '视频加载失败';
  });
  removeKeyboardControls = bindVideoKeyboardControls(instance, frame);
}

onMounted(() => {
  void initPlayer();
});

onUnmounted(() => {
  removeKeyboardControls?.();
  removeKeyboardControls = null;

  if (player && !player.isDisposed()) player.dispose();

  player = null;
});
</script>

<template>
  <div
    ref="frameEl"
    class="videojs-preview preview-load-frame"
    :class="{ 'is-loading': !loaded, 'is-loaded': loaded }"
    tabindex="0"
  >
    <PreviewLoading v-if="!loaded" :message="message" />
    <video
      ref="videoEl"
      class="video-js vjs-default-skin vjs-big-play-centered preview-load-target"
      controls
      preload="metadata"
    />
  </div>
</template>

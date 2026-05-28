import videojs from 'video.js';
import zhCN from 'video.js/dist/lang/zh-CN.json';
import { createNodePlugin } from '../../utils/nodePluginFactory';
import { NodePluginPreviewInput } from './types';

videojs.addLanguage('zh-CN', zhCN);

const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function togglePlayback(player: ReturnType<typeof videojs>): void {
  if (player.paused()) {
    void player.play();
    return;
  }

  player.pause();
}

function seekBy(
  player: ReturnType<typeof videojs>,
  deltaSeconds: number,
): void {
  const currentTime = player.currentTime() || 0;
  const duration = player.duration();
  const maxTime =
    typeof duration === 'number' && Number.isFinite(duration)
      ? duration
      : Math.max(currentTime + deltaSeconds, currentTime);

  player.currentTime(clamp(currentTime + deltaSeconds, 0, maxTime));
}

function setVolumeBy(
  player: ReturnType<typeof videojs>,
  deltaVolume: number,
): void {
  const nextVolume = clamp((player.volume() ?? 0) + deltaVolume, 0, 1);

  player.volume(nextVolume);

  if (nextVolume > 0 && player.muted()) {
    player.muted(false);
  }
}

function toggleFullscreen(player: ReturnType<typeof videojs>): void {
  if (player.isFullscreen()) {
    player.exitFullscreen();
    return;
  }

  player.requestFullscreen();
}

function bindKeyboardControls(
  player: ReturnType<typeof videojs>,
  element: HTMLElement,
): () => void {
  const focusPreview = () => element.focus();

  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;

    return Boolean(
      target.closest('input, textarea, select, [contenteditable="true"]') ||
      (target.closest('button') && !element.contains(target)),
    );
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!document.body.contains(element)) return;
    if (isEditableTarget(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    switch (event.key) {
      case ' ':
      case 'k':
      case 'K':
        togglePlayback(player);
        break;
      case 'ArrowLeft':
        seekBy(player, -SEEK_STEP_SECONDS);
        break;
      case 'ArrowRight':
        seekBy(player, SEEK_STEP_SECONDS);
        break;
      case 'ArrowUp':
        setVolumeBy(player, VOLUME_STEP);
        break;
      case 'ArrowDown':
        setVolumeBy(player, -VOLUME_STEP);
        break;
      case 'm':
      case 'M':
        player.muted(!player.muted());
        break;
      case 'f':
      case 'F':
        toggleFullscreen(player);
        break;
      case 'Home':
        player.currentTime(0);
        break;

      case 'End': {
        const duration = player.duration();

        if (typeof duration === 'number' && Number.isFinite(duration)) {
          player.currentTime(duration);
        }

        break;
      }

      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  element.tabIndex = 0;
  element.addEventListener('click', focusPreview);
  document.addEventListener('keydown', onKeyDown, true);

  return () => {
    element.removeEventListener('click', focusPreview);
    document.removeEventListener('keydown', onKeyDown, true);
  };
}

function disposeWhenDetached(
  player: ReturnType<typeof videojs>,
  element: HTMLElement,
  cleanup: () => void,
): void {
  const observer = new MutationObserver(() => {
    if (document.body.contains(element)) return;

    cleanup();

    if (!player.isDisposed()) {
      player.dispose();
    }

    observer.disconnect();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function renderVideoPreview(input: NodePluginPreviewInput): HTMLElement {
  const wrapper = document.createElement('div');
  const video = document.createElement('video');
  const sourceType = input.nodeTypeInfo.mime || 'video/mp4';

  wrapper.className = 'videojs-preview';
  video.className = 'video-js vjs-default-skin vjs-big-play-centered';
  video.controls = true;
  video.muted = false;
  video.preload = 'metadata';
  video.volume = 1;
  wrapper.appendChild(video);

  requestAnimationFrame(() => {
    const player = videojs(video, {
      controls: true,
      fluid: true,
      html5: {
        nativeAudioTracks: true,
        nativeVideoTracks: true,
        vhs: {
          overrideNative: false,
        },
      },
      language: 'zh-CN',
      muted: false,
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      preload: 'metadata',
      responsive: true,
      sources: [{ src: input.fileUrl, type: sourceType }],
      techOrder: ['html5'],
    });

    player.ready(() => {
      player.muted(false);
      player.volume(1);
      wrapper.focus();
    });
    disposeWhenDetached(player, wrapper, bindKeyboardControls(player, wrapper));
  });

  return wrapper;
}

export const videoPlugin = createNodePlugin({
  id: 'video',
  defaultInfo: {
    iconClass: 'fas fa-file-video',
    className: 'video',
  },
  extensions: {
    mp4: { mime: 'video/mp4' },
    mkv: { mime: 'video/x-matroska' },
    webm: { mime: 'video/webm' },
    avi: { mime: 'video/x-msvideo' },
    mov: { mime: 'video/quicktime' },
    flv: { mime: 'video/x-flv' },
  },
  preview: input => renderVideoPreview(input),
});

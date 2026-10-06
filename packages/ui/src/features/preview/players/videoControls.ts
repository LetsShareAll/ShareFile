export type VideoJsPlayer = ReturnType<(typeof import('video.js'))['default']>;

const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function seekBy(target: VideoJsPlayer, deltaSeconds: number): void {
  const currentTime = target.currentTime() || 0;
  const duration = target.duration();
  const maxTime =
    typeof duration === 'number' && Number.isFinite(duration)
      ? duration
      : Math.max(currentTime + deltaSeconds, currentTime);

  target.currentTime(clamp(currentTime + deltaSeconds, 0, maxTime));
}

function setVolumeBy(target: VideoJsPlayer, deltaVolume: number): void {
  const nextVolume = clamp((target.volume() ?? 0) + deltaVolume, 0, 1);

  target.volume(nextVolume);

  if (nextVolume > 0 && target.muted()) target.muted(false);
}

function toggleFullscreen(target: VideoJsPlayer): void {
  if (target.isFullscreen()) {
    target.exitFullscreen();

    return;
  }

  target.requestFullscreen();
}

function handleShortcut(event: KeyboardEvent, target: VideoJsPlayer): boolean {
  switch (event.key) {
    case ' ':
    case 'k':
    case 'K':
      if (target.paused()) void target.play();
      else target.pause();

      break;
    case 'ArrowLeft':
      seekBy(target, -SEEK_STEP_SECONDS);

      break;
    case 'ArrowRight':
      seekBy(target, SEEK_STEP_SECONDS);

      break;
    case 'ArrowUp':
      setVolumeBy(target, VOLUME_STEP);

      break;
    case 'ArrowDown':
      setVolumeBy(target, -VOLUME_STEP);

      break;
    case 'm':
    case 'M':
      target.muted(!target.muted());

      break;
    case 'f':
    case 'F':
      toggleFullscreen(target);

      break;
    case 'Home':
      target.currentTime(0);

      break;

    case 'End': {
      const duration = target.duration();

      if (typeof duration === 'number' && Number.isFinite(duration)) {
        target.currentTime(duration);
      }

      break;
    }

    default:
      return false;
  }

  return true;
}

function isEditableTarget(
  element: HTMLElement,
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]') ||
    (target.closest('button') && !element.contains(target)),
  );
}

/**
 * 播放器快捷键（与旧 videoPlugin 的绑定行为一致），返回解绑函数。
 */
export function bindVideoKeyboardControls(
  target: VideoJsPlayer,
  element: HTMLElement,
): () => void {
  const focusPreview = (): void => element.focus();

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!document.body.contains(element)) return;

    if (isEditableTarget(element, event.target)) return;

    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (!handleShortcut(event, target)) return;

    event.preventDefault();
    event.stopPropagation();
  };

  element.addEventListener('click', focusPreview);
  document.addEventListener('keydown', onKeyDown, true);

  return () => {
    element.removeEventListener('click', focusPreview);
    document.removeEventListener('keydown', onKeyDown, true);
  };
}

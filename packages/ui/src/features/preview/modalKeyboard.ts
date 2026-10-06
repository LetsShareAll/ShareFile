const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** 视频 / 音频播放器容器：焦点落在里面时 ←/→ 归播放器（videoControls 已处理）。 */
const PLAYER_SELECTORS = [
  '.videojs-preview',
  '.video-js',
  '.amplitude-preview',
  'video',
  'audio',
];

function isRendered(element: HTMLElement): boolean {
  return element.getClientRects().length > 0 || element.offsetParent !== null;
}

export function getFocusableElements(
  container: HTMLElement | null,
): HTMLElement[] {
  if (!container) return [];

  return [
    ...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ].filter(isRendered);
}

/**
 * Tab / Shift+Tab 在弹窗内循环：焦点不在弹窗内时先送进第一个可聚焦元素。
 */
export function trapFocus(
  container: HTMLElement | null,
  event: KeyboardEvent,
): void {
  if (!container) return;

  event.preventDefault();

  const focusable = getFocusableElements(container);

  if (focusable.length === 0) {
    container.focus();

    return;
  }

  const active = document.activeElement;
  const index = active instanceof HTMLElement ? focusable.indexOf(active) : -1;
  const step = event.shiftKey ? -1 : 1;
  const nextIndex =
    index < 0
      ? step === 1
        ? 0
        : focusable.length - 1
      : (index + step + focusable.length) % focusable.length;

  focusable[nextIndex]?.focus();
}

function isPlayerElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return PLAYER_SELECTORS.some(selector => target.closest(selector) !== null);
}

/** 事件源在播放器里，或播放器处于全屏时，←/→ 不翻页。 */
export function isPlayerContext(target: EventTarget | null): boolean {
  if (isPlayerElement(target)) return true;

  return isPlayerElement(document.fullscreenElement);
}

import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  watch,
} from 'vue';

const SHOW_DELAY_MS = 10;
const HIDE_TRANSITION_MS = 300;

export interface ModalShellOptions {
  /** 弹窗可见性（来自父组件 props）。 */
  visible: () => boolean;
  /** 弹窗打开期间挂在 window 上的按键处理（Esc / Tab / ←→）。 */
  onKeydown: (event: KeyboardEvent) => void;
  /** 打开后聚焦的元素，通常是弹窗容器本身。 */
  getFocusTarget: () => HTMLElement | null;
}

/**
 * 弹窗外壳：显隐过渡、body 滚动锁、按键监听生命周期，以及插槽内容切到
 * `.code-preview` 时同步 `modal-body-code`（旧弹窗行为）。
 */
export function useModalShell(options: ModalShellOptions) {
  const rendered = ref(false);
  const shown = ref(false);
  const bodyEl = ref<HTMLElement | null>(null);
  const hasCodeContent = ref(false);

  let showTimer: number | undefined;
  let hideTimer: number | undefined;
  let previousOverflow: string | null = null;
  let bodyObserver: MutationObserver | null = null;

  function clearTimers(): void {
    if (showTimer !== undefined) {
      window.clearTimeout(showTimer);
      showTimer = undefined;
    }

    if (hideTimer !== undefined) {
      window.clearTimeout(hideTimer);
      hideTimer = undefined;
    }
  }

  function syncCodeContent(): void {
    hasCodeContent.value =
      bodyEl.value?.firstElementChild?.classList.contains('code-preview') ??
      false;
  }

  /**
   * 插槽内容自身从加载态切换到 `.code-preview` 时弹窗不会重新渲染，
   * 因此监听 body 子节点变化来同步 `modal-body-code`。
   */
  function observeBody(): void {
    const body = bodyEl.value;

    if (!body) return;

    bodyObserver?.disconnect();
    bodyObserver = new MutationObserver(syncCodeContent);
    bodyObserver.observe(body, { childList: true, subtree: true });
  }

  function stopObservingBody(): void {
    bodyObserver?.disconnect();
    bodyObserver = null;
  }

  function lockScroll(): void {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  function unlockScroll(): void {
    if (previousOverflow === null) return;

    document.body.style.overflow = previousOverflow;
    previousOverflow = null;
  }

  /**
   * 打开后把焦点移入弹窗。遮罩在 `.show` 生效前仍是 `visibility: hidden`，
   * 此时聚焦会静默失败，因此下一帧再补一次（用户已点进弹窗则不抢焦点）。
   */
  function focusDialog(): void {
    const target = options.getFocusTarget();

    if (!target) return;

    target.focus();

    if (document.activeElement === target) return;

    window.setTimeout(() => {
      if (!target.contains(document.activeElement)) target.focus();
    }, 50);
  }

  async function open(): Promise<void> {
    clearTimers();
    rendered.value = true;
    lockScroll();
    window.addEventListener('keydown', options.onKeydown);
    await nextTick();
    observeBody();
    showTimer = window.setTimeout(() => {
      shown.value = true;
      showTimer = undefined;
      syncCodeContent();
      focusDialog();
    }, SHOW_DELAY_MS);
  }

  function close(): void {
    clearTimers();
    stopObservingBody();
    shown.value = false;
    unlockScroll();
    window.removeEventListener('keydown', options.onKeydown);
    hideTimer = window.setTimeout(() => {
      rendered.value = false;
      hideTimer = undefined;
    }, HIDE_TRANSITION_MS);
  }

  watch(options.visible, value => {
    if (value) {
      void open();

      return;
    }

    close();
  });

  onMounted(() => {
    if (options.visible()) void open();
  });

  onUpdated(syncCodeContent);

  onBeforeUnmount(() => {
    clearTimers();
    stopObservingBody();
    unlockScroll();
    window.removeEventListener('keydown', options.onKeydown);
  });

  return { rendered, shown, bodyEl, hasCodeContent };
}

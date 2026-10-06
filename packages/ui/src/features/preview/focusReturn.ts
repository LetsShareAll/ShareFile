export interface FocusReturn {
  /** 打开预览时记住触发元素（通常是列表卡片）。 */
  capture(): void;
  /** 关闭预览时把焦点还回去；没有触发元素（深链）时不动焦点。 */
  restore(): void;
}

/**
 * 焦点还原：只认弹窗外的真实元素，避免把 body 或弹窗内部的元素当成触发源。
 */
export function createFocusReturn(): FocusReturn {
  let trigger: HTMLElement | null = null;

  return {
    capture(): void {
      const active = document.activeElement;

      trigger =
        active instanceof HTMLElement &&
        active !== document.body &&
        !active.closest('.modal-overlay')
          ? active
          : null;
    },

    restore(): void {
      const target = trigger;

      trigger = null;

      if (target?.isConnected) target.focus();
    },
  };
}

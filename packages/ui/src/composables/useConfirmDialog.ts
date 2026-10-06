import { reactive } from 'vue';

export interface ConfirmDialogOptions {
  title: string;
  /** 纯文本消息。 */
  message?: string;
  /** 允许富文本的 HTML 片段，渲染前经统一消毒。 */
  html?: string;
  confirmText?: string;
  cancelText?: string;
}

export interface ConfirmDialogState {
  open: boolean;
  options: ConfirmDialogOptions | null;
}

const state = reactive<ConfirmDialogState>({ open: false, options: null });

let resolver: ((confirmed: boolean) => void) | null = null;

/**
 * 命令式确认弹窗：`const ok = await confirmDialog({ title, html })`。
 *
 * 同一时刻只保留一个确认框，后来的请求会把先前的按「取消」结算，避免 Promise 悬挂。
 */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  resolver?.(false);
  state.options = options;
  state.open = true;

  return new Promise<boolean>(resolve => {
    resolver = resolve;
  });
}

export function resolveConfirmDialog(confirmed: boolean): void {
  const currentResolver = resolver;

  resolver = null;
  state.open = false;
  state.options = null;

  currentResolver?.(confirmed);
}

export function useConfirmDialogState(): ConfirmDialogState {
  return state;
}

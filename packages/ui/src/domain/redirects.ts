import type { ShareNode } from './share-file';

/**
 * 是否必须二次确认后再跳转。
 *
 * 规则：外挂源节点上的 `redirect_url` 来自第三方仓库，即使声明为 `direct` 也必须确认，
 * 否则第三方内容可以让页面直接 302 到任意站点；本地索引由仓库维护者掌控，沿用旧的
 * `direct` 语义。
 */
export function shouldConfirmRedirect(node: ShareNode): boolean {
  return node.source === 'external' || node.redirect_type === 'confirm';
}

/**
 * 跳转确认文案：优先用节点自带文案，缺失时用目标地址兜底。
 */
export function getRedirectConfirmMessage(node: ShareNode): string | null {
  if (node.redirect_confirm_message) return node.redirect_confirm_message;
  if (node.redirect_url) return `即将离开本站，前往：${node.redirect_url}`;

  return null;
}

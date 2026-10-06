import type { ShareNode } from './schema';

/**
 * 受限内容（`restricted`）的统一语义。
 *
 * **诚实前提**：这是一个静态站点，索引与文件都在公开 URL 上。受限只表示
 * 「前端不提供分享入口（复制直链 / 页面链接 / curl）+ 明确提示」，它**不是**
 * 安全边界——任何人都可以绕过页面直接访问 URL。
 *
 * 因此受限节点照常可以预览与播放：拦不住的东西没必要假装拦得住，挡住预览只会
 * 伤害正常浏览，却不构成任何保护。这是刻意的取舍。
 */
export const RESTRICTED_NOTICE =
  '受限内容：仅索引可见，不提供分享链接；本静态站点无法阻止直接访问 URL';

/**
 * 是否为受限节点：只有严格的 `true` 才算，缺失或 false 均视为未限制。
 */
export function isRestrictedNode(
  node: Pick<ShareNode, 'restricted'> | null | undefined,
): boolean {
  return node?.restricted === true;
}

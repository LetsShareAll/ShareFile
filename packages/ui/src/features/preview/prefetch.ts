import type { NodePluginRegistry } from '../../domain/plugins';
import type { ShareNode } from '../../domain/share-file';
import { createBuiltinRegistry } from '../../plugins';

const HOVER_DELAY_MS = 200;

type PreviewLoader = NonNullable<
  ReturnType<NodePluginRegistry['resolve']>['plugin']['preview']
>;

/**
 * 只预取**插件 chunk**（动态 import），绝不预取文件内容：
 * 目录里常有几十 MB 的图片/视频，误预取会白抢带宽。
 */
export function prefetchPreviewChunk(
  node: ShareNode | null | undefined,
  registry: NodePluginRegistry = createBuiltinRegistry(),
  loaded: Set<string> = new Set(),
): void {
  if (!node || node.type !== 'file') return;

  try {
    const input = { name: node.name, nodeType: 'file' as const, node };
    const plugin = registry.resolve(input).plugin;

    if (!plugin.preview || loaded.has(plugin.id)) return;

    loaded.add(plugin.id);
    void (plugin.preview as PreviewLoader)({
      ...input,
      fileUrl: '',
      nodeTypeInfo: plugin.getInfo(input),
    }).catch(() => undefined);
  } catch {
    // 没有匹配插件（理论上不会）或加载失败：静默忽略，预取不该影响主流程。
  }
}

let hoverTimer: number | undefined;

function canHover(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

/** 悬停 200ms 后才预取；离开卡片调用 `cancelHoverPrefetch` 取消。 */
export function scheduleHoverPrefetch(
  node: ShareNode | null | undefined,
  registry?: NodePluginRegistry,
): void {
  if (!canHover()) return;

  cancelHoverPrefetch();
  hoverTimer = window.setTimeout(() => {
    hoverTimer = undefined;
    prefetchPreviewChunk(node, registry);
  }, HOVER_DELAY_MS);
}

export function cancelHoverPrefetch(): void {
  if (hoverTimer === undefined) return;

  window.clearTimeout(hoverTimer);
  hoverTimer = undefined;
}

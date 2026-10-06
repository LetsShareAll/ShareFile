import { sortNodes, type SortDirection, type SortKey } from '../../domain/sort';
import type { ShareNode } from '../../domain/share-file';
import { resolveNodeDisplay } from '../browse/nodeDisplay';

export interface NavigationSort {
  key: SortKey;
  direction: SortDirection;
  getPath: (nodeId: string) => string;
}

/**
 * 预览导航顺序 = 列表顺序：与 BrowseView 的 `rows` 用同一套排序函数与排序参数。
 */
export function sortNavigationNodes(
  nodes: readonly ShareNode[],
  sort: NavigationSort,
): ShareNode[] {
  return sortNodes(nodes, sort.key, sort.direction, {
    getPath: sort.getPath,
    getTypeClass: node => resolveNodeDisplay(node).className,
  });
}

/**
 * 当前节点在预览导航列表中的下标；不在列表里（深链、索引已变化）返回 -1。
 */
export function findNodeIndex(
  nodes: readonly ShareNode[],
  nodeId: string | null | undefined,
): number {
  if (!nodeId) return -1;

  return nodes.findIndex(node => node.id === nodeId);
}

/**
 * 上 / 下一个可预览节点：边界停住（不循环），列表里没有当前节点时也不猜。
 */
export function getAdjacentNode(
  nodes: readonly ShareNode[],
  nodeId: string | null | undefined,
  step: -1 | 1,
): ShareNode | null {
  const index = findNodeIndex(nodes, nodeId);

  if (index < 0) return null;

  return nodes[index + step] ?? null;
}

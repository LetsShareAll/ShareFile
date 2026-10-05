import { getNodePath } from './paths';
import type { ShareFile } from './share-file';

/**
 * 归一化搜索文本：去首尾空白并转小写（保留多语言字符）。
 */
export function normalizeSearchText(text?: string): string {
  return (text || '').trim().toLocaleLowerCase();
}

/**
 * 搜索节点：在 name / description / 路径上做子串匹配，文件夹优先，其余按 zh-CN 路径排序。
 */
export function searchNodes(
  shareFile: ShareFile,
  nodePathIndex: Map<string, string>,
  query: string,
): string[] {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) return [];

  return Object.values(shareFile.nodes)
    .filter(node => node.id !== shareFile.root_id)
    .filter(node => {
      const nodePath = getNodePath(nodePathIndex, node.id);
      const searchableText = normalizeSearchText(
        [node.name, node.description, nodePath].filter(Boolean).join(' '),
      );

      return searchableText.includes(normalizedQuery);
    })
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;

      return getNodePath(nodePathIndex, left.id).localeCompare(
        getNodePath(nodePathIndex, right.id),
        'zh-CN',
      );
    })
    .map(node => node.id);
}

import type { ShareFile, ShareNode } from './share-file';

const README_FILE_NAME = 'README.md';

/**
 * 目录 README 预览：只在当前目录的直接子节点里找 `README.md`（与旧实现一致，不递归）。
 */
export function findDirectoryReadme(
  shareFile: ShareFile | null | undefined,
  path: string,
): ShareNode | undefined {
  if (!shareFile) return undefined;

  const nodeId = shareFile.path_index[path];
  const node = nodeId ? shareFile.nodes[nodeId] : undefined;

  if (!node || node.type !== 'folder') return undefined;

  const readmeId = node.children.find(
    childId => shareFile.nodes[childId]?.name === README_FILE_NAME,
  );

  return readmeId ? shareFile.nodes[readmeId] : undefined;
}

/**
 * README 内容地址：优先用索引里的直链，否则回退到同源 `<目录路径>/README.md`。
 */
export function getReadmeUrl(node: ShareNode, path: string): string {
  if (node.url) return node.url;

  return path === '/' ? '/README.md' : `${path}/README.md`;
}

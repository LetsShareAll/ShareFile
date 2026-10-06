import type { ShareFile, ShareNode } from './share-file/schema';

/**
 * 归一化路由路径：保证前导斜杠、去掉尾部斜杠。
 */
export function normalizeRoutePath(value: string): string {
  if (!value) return '/';

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');

  return withoutTrailingSlash || '/';
}

/**
 * 路由输入白名单：拒绝协议相对地址、带协议的绝对地址、`..` / `.` 段与含冒号的段。
 */
export function isSafeRoutePath(value: string): boolean {
  const raw = (value ?? '').trim();

  if (!raw) return true;
  if (raw.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false;

  return raw
    .split('/')
    .every(
      segment => segment !== '..' && segment !== '.' && !segment.includes(':'),
    );
}

/**
 * 把任意输入收敛为可安全使用的路由路径，非法输入退回根路径。
 */
export function sanitizeRoutePath(value: string): string {
  return isSafeRoutePath(value) ? normalizeRoutePath(value) : '/';
}

/**
 * 生成可写入地址栏的路径（非根路径做一次 encodeURI）。
 */
export function formatBrowserPath(path: string): string {
  const normalizedPath = normalizeRoutePath(path);

  return normalizedPath === '/' ? '/' : encodeURI(normalizedPath);
}

/**
 * 节点 ID → 路径。ID 不带前导斜杠，根节点固定为 `/`。
 */
export function getNodePathFromId(nodeId: string): string {
  if (nodeId === 'root') return '/';

  return `/${nodeId}`.replace(/\/+/g, '/');
}

/**
 * 用 path_index（路径 → 节点 ID）反查出「节点 ID → 路径」映射。
 */
export function buildNodePathIndex(shareFile: ShareFile): Map<string, string> {
  return new Map(
    Object.entries(shareFile.path_index).map(([path, nodeId]) => [
      nodeId,
      path,
    ]),
  );
}

/**
 * 取节点路径，索引缺失时按 ID 规则回退。
 */
export function getNodePath(
  nodePathIndex: Map<string, string>,
  nodeId: string,
): string {
  return nodePathIndex.get(nodeId) ?? getNodePathFromId(nodeId);
}

export interface BreadcrumbSegment {
  label: string;
  path: string;
  isCurrent: boolean;
}

/**
 * 面包屑分段：根节点单独呈现，最后一段为当前路径。
 */
export function getBreadcrumbSegments(path: string): BreadcrumbSegment[] {
  const segments = normalizeRoutePath(path).split('/').filter(Boolean);

  return segments.map((segment, index) => ({
    label: segment,
    path: `/${segments.slice(0, index + 1).join('/')}`,
    isCurrent: index === segments.length - 1,
  }));
}

/**
 * 列出目录节点的可见子节点 ID（保持索引顺序）。
 */
export function getChildNodeIds(
  shareFile: ShareFile,
  nodeId: string,
): string[] {
  const node = shareFile.nodes[nodeId];

  return node ? [...node.children] : [];
}

/**
 * 按节点 ID 解析节点，缺失返回 undefined。
 */
export function getNode(
  shareFile: ShareFile,
  nodeId: string,
): ShareNode | undefined {
  return shareFile.nodes[nodeId];
}

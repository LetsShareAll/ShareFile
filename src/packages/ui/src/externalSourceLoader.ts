/**
 * @fileoverview 外部源加载和合并模块
 *
 * 负责：
 * - 从外部仓库加载 share-file.json
 * - 合并外部节点到本地索引
 * - 路径重写和 ID 前缀处理
 * - 缓存管理
 */

import type {
  ShareFile,
  ShareNode,
  ExternalSourceCache,
  MountSourceInfo,
} from '@share-file/types';
import {
  initExternalSourceStatus,
  updateExternalSourceStatus,
} from './notifications';

// ────────────── 常量定义 ──────────────

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时（与 jsDelivr CDN 缓存对齐）
const CACHE_KEY_PREFIX = 'share-file-external:';

// ────────────── 类型定义 ──────────────

interface MountPointInfo {
  mountPointId: string;
  mountPointPath: string;
  mountSource: MountSourceInfo;
}

interface LoadExternalResult {
  success: boolean;
  data?: ShareFile;
  error?: string;
  fromCache?: boolean;
}

// ────────────── URL 构建 ──────────────

function trimUrlSegment(segment: string): string {
  return segment.replace(/^\/+|\/+$/g, '');
}

function joinUrl(baseUrl: string, ...segments: string[]): string {
  const normalizedBase = baseUrl.replace(/\/+$/g, '');
  const normalizedSegments = segments.map(trimUrlSegment).filter(Boolean);

  return [normalizedBase, ...normalizedSegments].join('/');
}

/**
 * 根据 mountSource 配置构建外部仓库根目录下的 share-file.json URL。
 */
function buildExternalIndexUrl(
  mountSource: MountSourceInfo,
  useCdnIndex: boolean,
): string {
  const { provider, repository, branch = 'main', accessCdn } = mountSource;

  if (provider !== 'github') {
    throw new Error(`不支持的存储提供商: ${provider}`);
  }

  const fileName = useCdnIndex ? 'share-file.cdn.json' : 'share-file.json';

  // 自定义 CDN URL
  if (accessCdn && accessCdn !== 'jsdelivr' && accessCdn !== 'raw') {
    return joinUrl(accessCdn, repository, branch, fileName);
  }

  // jsDelivr CDN
  if (accessCdn === 'jsdelivr' || !accessCdn) {
    return `https://cdn.jsdelivr.net/gh/${repository}@${branch}/${fileName}`;
  }

  // GitHub raw URL
  if (accessCdn === 'raw') {
    return joinUrl(
      'https://raw.githubusercontent.com',
      repository,
      branch,
      fileName,
    );
  }

  throw new Error(`无效的 accessCdn 配置: ${accessCdn}`);
}

function buildExternalFileUrl(
  mountSource: MountSourceInfo,
  nodeId: string,
): string {
  const { provider, repository, branch = 'main', accessCdn } = mountSource;

  if (provider !== 'github') {
    throw new Error(`不支持的存储提供商: ${provider}`);
  }

  if (accessCdn && accessCdn !== 'jsdelivr' && accessCdn !== 'raw') {
    return joinUrl(accessCdn, repository, branch, nodeId);
  }

  if (accessCdn === 'raw') {
    return joinUrl(
      'https://raw.githubusercontent.com',
      repository,
      branch,
      nodeId,
    );
  }

  return `https://cdn.jsdelivr.net/gh/${repository}@${branch}/${trimUrlSegment(
    nodeId,
  )}`;
}

/**
 * 尝试多个分支名称（main -> master）
 */
async function fetchWithBranchFallback(
  mountSource: MountSourceInfo,
  useCdn: boolean,
): Promise<Response> {
  const branches = mountSource.branch
    ? [mountSource.branch]
    : ['main', 'master'];

  for (const branch of branches) {
    const url = buildExternalIndexUrl({ ...mountSource, branch }, useCdn);

    try {
      const response = await fetch(url);

      if (response.ok) {
        return response;
      }
    } catch (error) {
      // 继续尝试下一个分支
      console.debug(`尝试分支 ${branch} 失败:`, error);
    }
  }

  throw new Error(`无法从任何分支加载外部源: ${branches.join(', ')}`);
}

// ────────────── 缓存管理 ──────────────

/**
 * 生成缓存键
 */
function getCacheKey(mountPoint: string, mountSource: MountSourceInfo): string {
  const {
    provider,
    repository,
    branch = 'main',
    subPath = '/',
    accessCdn = 'jsdelivr',
    useCdnIndex = false,
  } = mountSource;

  return `${CACHE_KEY_PREFIX}${provider}:${repository}:${branch}:${subPath}:${accessCdn}:${useCdnIndex}:${mountPoint}`;
}

/**
 * 从缓存加载外部源
 */
function loadFromCache(cacheKey: string): ShareFile | null {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const cacheData: ExternalSourceCache = JSON.parse(cached);
    const now = new Date().toISOString();

    // 检查是否过期
    if (cacheData.expiresAt < now) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    console.log(`从缓存加载外部源: ${cacheKey}`);
    return cacheData.data;
  } catch (error) {
    console.error('缓存加载失败:', error);
    return null;
  }
}

/**
 * 保存到缓存
 */
function saveToCache(
  cacheKey: string,
  data: ShareFile,
  mountPoint: string,
  mountSource: MountSourceInfo,
): void {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

    const cacheData: ExternalSourceCache = {
      data,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      mountPoint,
      source: {
        provider: mountSource.provider,
        repository: mountSource.repository,
        branch: mountSource.branch || 'main',
        subPath: mountSource.subPath,
      },
    };

    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`外部源已缓存: ${cacheKey}`);
  } catch (error) {
    console.error('缓存保存失败:', error);
  }
}

/**
 * 清除指定挂载点的缓存
 */
export function clearMountPointCache(
  mountPoint: string,
  mountSource: MountSourceInfo,
): void {
  const cacheKey = getCacheKey(mountPoint, mountSource);
  localStorage.removeItem(cacheKey);
  console.log(`已清除缓存: ${cacheKey}`);
}

/**
 * 清除所有外部源缓存
 */
export function clearAllExternalCache(): void {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith(CACHE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
  console.log('已清除所有外部源缓存');
}

// ────────────── 外部源加载 ──────────────

/**
 * 加载外部 share-file.json
 */
async function loadExternalShareFile(
  mountPoint: string,
  mountSource: MountSourceInfo,
  useCache: boolean = true,
): Promise<LoadExternalResult> {
  const cacheKey = getCacheKey(mountPoint, mountSource);

  // 尝试从缓存加载
  if (useCache) {
    const cached = loadFromCache(cacheKey);

    if (cached) {
      return { success: true, data: cached, fromCache: true };
    }
  }

  // 从网络加载
  try {
    const useCdn = mountSource.useCdnIndex ?? false;
    const response = await fetchWithBranchFallback(mountSource, useCdn);
    const data: ShareFile = await response.json();

    // 保存到缓存
    saveToCache(cacheKey, data, mountPoint, mountSource);

    return { success: true, data, fromCache: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`加载外部源失败 (${mountPoint}):`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ────────────── 节点合并 ──────────────

/**
 * 过滤外部源的节点（支持 subPath）
 */
function filterExternalNodes(
  externalData: ShareFile,
  subPath: string,
): { nodes: Record<string, ShareNode>; rootNodeId: string } | null {
  if (subPath === '/') {
    return { nodes: externalData.nodes, rootNodeId: externalData.rootId };
  }

  // 查找 subPath 对应的节点
  const cleanSubPath = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const subPathNodeId = externalData.pathIndex[cleanSubPath];

  if (!subPathNodeId) {
    console.error(`外部源中不存在路径: ${cleanSubPath}`);
    return null;
  }

  // 过滤出 subPath 下的所有节点
  const filteredNodes: Record<string, ShareNode> = {};
  const subPathNode = externalData.nodes[subPathNodeId];

  if (!subPathNode) {
    return null;
  }

  // 递归收集所有子节点
  function collectNodes(nodeId: string): void {
    const node = externalData.nodes[nodeId];
    if (!node) return;

    filteredNodes[nodeId] = node;

    if (node.children) {
      node.children.forEach((childId: string) => collectNodes(childId));
    }
  }

  collectNodes(subPathNodeId);

  return { nodes: filteredNodes, rootNodeId: subPathNodeId };
}

/**
 * 重写外部节点的 ID 和路径引用
 */
function rewriteExternalNodes(
  externalNodes: Record<string, ShareNode>,
  externalRootId: string,
  mountPointPath: string,
  mountSource: MountSourceInfo,
  shouldGenerateFileUrls: boolean,
): { nodes: Record<string, ShareNode>; pathIndex: Record<string, string> } {
  const rewrittenNodes: Record<string, ShareNode> = {};
  const pathIndex: Record<string, string> = {};
  const idMapping: Record<string, string> = {};

  // 第一遍：建立 ID 映射
  Object.keys(externalNodes).forEach(oldId => {
    if (oldId === externalRootId) {
      // 根节点映射到挂载点
      idMapping[oldId] = mountPointPath;
    } else {
      // 其他节点添加挂载点前缀
      const newId = `${mountPointPath}/${oldId}`.replace(/\/+/g, '/');
      idMapping[oldId] = newId;
    }
  });

  // 第二遍：重写节点
  Object.entries(externalNodes).forEach(([oldId, node]) => {
    const newId = idMapping[oldId];
    const newParentId = node.parent ? idMapping[node.parent] || null : null;

    const shouldAddFileUrl =
      shouldGenerateFileUrls &&
      node.type === 'file' &&
      !node.url &&
      !node.redirect_url;

    const rewrittenNode: ShareNode = {
      ...node,
      id: newId,
      parent:
        newParentId === mountPointPath
          ? mountPointPath.split('/').slice(0, -1).join('/') || 'root'
          : newParentId,
      children: node.children.map(
        (childId: string) => idMapping[childId] || childId,
      ),
      source: 'external',
      mount_point: mountPointPath,
      ...(shouldAddFileUrl
        ? { url: buildExternalFileUrl(mountSource, oldId) }
        : {}),
    };

    rewrittenNodes[newId] = rewrittenNode;

    // 构建路径索引
    const nodePath = `/${newId}`.replace(/\/+/g, '/');
    pathIndex[nodePath] = newId;
  });

  return { nodes: rewrittenNodes, pathIndex };
}

/**
 * 合并外部节点到本地 ShareFile
 */
function mergeExternalNodes(
  localData: ShareFile,
  externalResult: {
    nodes: Record<string, ShareNode>;
    pathIndex: Record<string, string>;
  },
  mountPointId: string,
): ShareFile {
  const mergedNodes = { ...localData.nodes };
  const mergedPathIndex = { ...localData.pathIndex };
  const blockedExternalNodeIds = new Set<string>();

  const isLocalNode = (node?: ShareNode): boolean =>
    node?.source === undefined || node.source === 'local';

  const blockExternalSubtree = (nodeId: string): void => {
    if (blockedExternalNodeIds.has(nodeId)) return;

    blockedExternalNodeIds.add(nodeId);

    const node = externalResult.nodes[nodeId];
    if (!node) return;

    node.children.forEach(childId => blockExternalSubtree(childId));
  };

  Object.entries(externalResult.nodes).forEach(([nodeId, node]) => {
    const existingNode = mergedNodes[nodeId];

    if (
      existingNode &&
      isLocalNode(existingNode) &&
      !(existingNode.type === 'folder' && node.type === 'folder')
    ) {
      blockExternalSubtree(nodeId);
    }
  });

  // 合并节点（本地优先，处理冲突）
  Object.entries(externalResult.nodes).forEach(([nodeId, node]) => {
    if (blockedExternalNodeIds.has(nodeId)) {
      console.warn(`节点 ID 冲突，本地优先: ${nodeId}`);
      return;
    }

    const existingNode = mergedNodes[nodeId];

    if (
      existingNode?.type === 'folder' &&
      node.type === 'folder' &&
      isLocalNode(existingNode)
    ) {
      mergedNodes[nodeId] = {
        ...node,
        ...existingNode,
        source: existingNode.source ?? 'local',
        children: [...new Set([...existingNode.children, ...node.children])],
      };
    } else if (existingNode && isLocalNode(existingNode)) {
      console.warn(`节点 ID 冲突，本地优先: ${nodeId}`);
    } else {
      mergedNodes[nodeId] = node;
    }
  });

  // 合并路径索引
  Object.entries(externalResult.pathIndex).forEach(([path, nodeId]) => {
    if (blockedExternalNodeIds.has(nodeId)) return;

    const existingNodeId = mergedPathIndex[path];

    if (!existingNodeId) {
      mergedPathIndex[path] = nodeId;
      return;
    }

    if (existingNodeId === nodeId) return;

    if (isLocalNode(mergedNodes[existingNodeId])) {
      console.warn(`路径冲突，本地优先: ${path}`);
    } else {
      mergedPathIndex[path] = nodeId;
    }
  });

  // 更新挂载点节点的 children
  const mountPointNode = mergedNodes[mountPointId];

  if (mountPointNode) {
    const externalRootChildren = Object.values(externalResult.nodes)
      .filter(
        node =>
          node.parent === mountPointId && !blockedExternalNodeIds.has(node.id),
      )
      .map(node => node.id);

    // 创建新的节点对象以避免修改只读属性
    mergedNodes[mountPointId] = {
      ...mountPointNode,
      children: [
        ...new Set([...mountPointNode.children, ...externalRootChildren]),
      ],
    };
  }

  return {
    ...localData,
    nodes: mergedNodes,
    pathIndex: mergedPathIndex,
  };
}

// ────────────── 主函数 ──────────────

/**
 * 扫描并加载所有外部挂载源
 */
export async function loadAllExternalSources(
  localData: ShareFile,
): Promise<ShareFile> {
  // 查找所有挂载点
  const mountPoints: MountPointInfo[] = [];

  Object.entries(localData.nodes).forEach(([nodeId, node]) => {
    if (
      node.type === 'folder' &&
      (node as unknown as { mountSource?: MountSourceInfo }).mountSource
    ) {
      const mountSource = (node as unknown as { mountSource: MountSourceInfo })
        .mountSource;

      mountPoints.push({
        mountPointId: nodeId,
        mountPointPath: nodeId,
        mountSource,
      });
    }
  });

  if (mountPoints.length === 0) {
    console.log('未发现外部挂载源');
    return localData;
  }

  console.log(`发现 ${mountPoints.length} 个外部挂载源，开始加载...`);

  // 初始化加载状态通知
  initExternalSourceStatus(mountPoints.length);

  let mergedData = localData;

  // 并行加载所有外部源
  const loadPromises = mountPoints.map(async mountPoint => {
    const result = await loadExternalShareFile(
      mountPoint.mountPointPath,
      mountPoint.mountSource,
      true,
    );

    if (!result.success || !result.data) {
      updateExternalSourceStatus(
        mountPoint.mountPointPath,
        'error',
        result.error,
      );
      return null;
    }

    // 过滤节点（支持 subPath）
    const filtered = filterExternalNodes(
      result.data,
      mountPoint.mountSource.subPath || '/',
    );

    if (!filtered) {
      updateExternalSourceStatus(
        mountPoint.mountPointPath,
        'error',
        '子路径不存在',
      );
      return null;
    }

    // 重写节点 ID
    const rewritten = rewriteExternalNodes(
      filtered.nodes,
      filtered.rootNodeId,
      mountPoint.mountPointPath,
      mountPoint.mountSource,
      !(mountPoint.mountSource.useCdnIndex ?? false),
    );

    updateExternalSourceStatus(mountPoint.mountPointPath, 'success');

    return {
      mountPointId: mountPoint.mountPointId,
      rewritten,
    };
  });

  const results = await Promise.all(loadPromises);

  // 合并所有成功加载的外部源
  results.forEach(result => {
    if (result) {
      mergedData = mergeExternalNodes(
        mergedData,
        result.rewritten,
        result.mountPointId,
      );
    }
  });

  console.log('外部源加载完成');
  return mergedData;
}

/**
 * 刷新指定挂载点的外部源
 */
export async function refreshMountPoint(
  localData: ShareFile,
  mountPointId: string,
): Promise<ShareFile> {
  const mountPointNode = localData.nodes[mountPointId];

  if (
    !mountPointNode ||
    !(mountPointNode as unknown as { mountSource?: MountSourceInfo })
      .mountSource
  ) {
    throw new Error(`节点不是挂载点: ${mountPointId}`);
  }

  const mountSource = (
    mountPointNode as unknown as { mountSource: MountSourceInfo }
  ).mountSource;

  // 清除缓存
  clearMountPointCache(mountPointId, mountSource);

  // 重新加载
  const result = await loadExternalShareFile(mountPointId, mountSource, false);

  if (!result.success || !result.data) {
    throw new Error(result.error || '加载失败');
  }

  // 过滤和重写节点
  const filtered = filterExternalNodes(result.data, mountSource.subPath || '/');

  if (!filtered) {
    throw new Error('子路径不存在');
  }

  const rewritten = rewriteExternalNodes(
    filtered.nodes,
    filtered.rootNodeId,
    mountPointId,
    mountSource,
    !(mountSource.useCdnIndex ?? false),
  );

  // 合并到本地数据
  return mergeExternalNodes(localData, rewritten, mountPointId);
}

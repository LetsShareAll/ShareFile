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
} from './share-file';
import {
  getMountSourceAccessCdn,
  getMountSourceSubPath,
  getMountSourceUseCdnIndex,
  getNodeMountSource,
  getShareFilePathIndex,
  getShareFileRootId,
  normalizeShareFile,
} from './share-file';
import {
  initExternalSourceStatus,
  updateExternalSourceStatus,
} from './notifications';

// ────────────── 常量定义 ──────────────

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时（与 jsDelivr CDN 缓存对齐）
const CACHE_KEY_PREFIX = 'share-file-external:v2:';
const LEGACY_CACHE_KEY_PREFIXES = ['share-file-external:'];
const GITHUB_RAW_HOST = 'raw.githubusercontent.com';
const GITHUB_RAW_BASE_URL = `https://${GITHUB_RAW_HOST}`;

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

function buildCustomGithubCdnUrl(
  accessCdn: string,
  repository: string,
  branch: string,
  filePath: string,
): string {
  return joinUrl(accessCdn, GITHUB_RAW_HOST, repository, branch, filePath);
}

/**
 * 根据 mountSource 配置构建外部仓库根目录下的 share-file.json URL。
 */
function buildExternalIndexUrl(
  mountSource: MountSourceInfo,
  useCdnIndex: boolean,
): string {
  const { provider, repository, branch = 'main' } = mountSource;
  const accessCdn = getMountSourceAccessCdn(mountSource);

  if (provider !== 'github') {
    throw new Error(`不支持的存储提供商: ${provider}`);
  }

  const fileName = useCdnIndex ? 'share-file.cdn.json' : 'share-file.json';

  // 自定义 CDN URL
  if (accessCdn && accessCdn !== 'jsdelivr' && accessCdn !== 'raw') {
    return buildCustomGithubCdnUrl(accessCdn, repository, branch, fileName);
  }

  // jsDelivr CDN
  if (accessCdn === 'jsdelivr' || !accessCdn) {
    return `https://cdn.jsdelivr.net/gh/${repository}@${branch}/${fileName}`;
  }

  // GitHub raw URL
  if (accessCdn === 'raw') {
    return joinUrl(GITHUB_RAW_BASE_URL, repository, branch, fileName);
  }

  throw new Error(`无效的 access_cdn 配置: ${accessCdn}`);
}

function buildExternalFileUrl(
  mountSource: MountSourceInfo,
  nodeId: string,
): string {
  const { provider, repository, branch = 'main' } = mountSource;
  const accessCdn = getMountSourceAccessCdn(mountSource);

  if (provider !== 'github') {
    throw new Error(`不支持的存储提供商: ${provider}`);
  }

  if (accessCdn && accessCdn !== 'jsdelivr' && accessCdn !== 'raw') {
    return buildCustomGithubCdnUrl(accessCdn, repository, branch, nodeId);
  }

  if (accessCdn === 'raw') {
    return joinUrl(GITHUB_RAW_BASE_URL, repository, branch, nodeId);
  }

  return `https://cdn.jsdelivr.net/gh/${repository}@${branch}/${trimUrlSegment(
    nodeId,
  )}`;
}

function getExpectedFileUrlPrefix(mountSource: MountSourceInfo): string {
  const { repository, branch = 'main' } = mountSource;
  const accessCdn = getMountSourceAccessCdn(mountSource);

  if (accessCdn && accessCdn !== 'jsdelivr' && accessCdn !== 'raw') {
    return `${joinUrl(accessCdn, GITHUB_RAW_HOST, repository, branch)}/`;
  }

  if (accessCdn === 'raw') {
    return `${joinUrl(GITHUB_RAW_BASE_URL, repository, branch)}/`;
  }

  return `https://cdn.jsdelivr.net/gh/${repository}@${branch}/`;
}

function isUsableExternalFileUrl(
  value: unknown,
  mountSource: MountSourceInfo,
): value is string {
  if (typeof value !== 'string') return false;

  const url = value.trim();

  if (!url || url === 'undefined' || url === 'null') return false;

  try {
    new URL(url);
  } catch {
    return false;
  }

  return url.startsWith(getExpectedFileUrlPrefix(mountSource));
}

function hasRequiredCdnFileUrls(
  data: ShareFile,
  mountSource: MountSourceInfo,
): boolean {
  if (!(getMountSourceUseCdnIndex(mountSource) ?? false)) return true;

  return Object.values(data.nodes).every(node => {
    if (node.type !== 'file' || node.redirect_url) return true;

    return isUsableExternalFileUrl(node.url, mountSource);
  });
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
  return `${CACHE_KEY_PREFIX}${getCacheKeyBody(mountPoint, mountSource)}`;
}

function getCacheKeyBody(
  mountPoint: string,
  mountSource: MountSourceInfo,
): string {
  const { provider, repository, branch = 'main' } = mountSource;
  const subPath = getMountSourceSubPath(mountSource) ?? '/';
  const accessCdn = getMountSourceAccessCdn(mountSource) ?? 'jsdelivr';
  const useCdnIndex = getMountSourceUseCdnIndex(mountSource) ?? false;

  return `${provider}:${repository}:${branch}:${subPath}:${accessCdn}:${useCdnIndex}:${mountPoint}`;
}

function getLegacyCacheKeys(
  mountPoint: string,
  mountSource: MountSourceInfo,
): string[] {
  const body = getCacheKeyBody(mountPoint, mountSource);

  return LEGACY_CACHE_KEY_PREFIXES.map(prefix => `${prefix}${body}`);
}

/**
 * 从缓存加载外部源
 */
function loadFromCache(
  cacheKey: string,
  mountSource: MountSourceInfo,
): ShareFile | null {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const cacheData = JSON.parse(cached) as ExternalSourceCache &
      Record<string, unknown>;
    const now = new Date().toISOString();
    const expiresAt =
      typeof cacheData.expires_at === 'string'
        ? cacheData.expires_at
        : typeof cacheData.expiresAt === 'string'
          ? cacheData.expiresAt
          : undefined;

    // 检查是否过期
    if (!expiresAt || expiresAt < now) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    const data = normalizeShareFile(cacheData.data);

    if (!data) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    if (!hasRequiredCdnFileUrls(data, mountSource)) {
      localStorage.removeItem(cacheKey);
      console.warn(`外部源缓存包含无效 CDN URL，已丢弃: ${cacheKey}`);
      return null;
    }

    console.debug(`从缓存加载外部源: ${cacheKey}`);
    return data;
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
      cached_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      mount_point: mountPoint,
      source: {
        provider: mountSource.provider,
        repository: mountSource.repository,
        branch: mountSource.branch || 'main',
        sub_path: getMountSourceSubPath(mountSource),
      },
    };

    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.debug(`外部源已缓存: ${cacheKey}`);
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
  const cacheKeys = [
    getCacheKey(mountPoint, mountSource),
    ...getLegacyCacheKeys(mountPoint, mountSource),
  ];

  cacheKeys.forEach(cacheKey => {
    localStorage.removeItem(cacheKey);
    console.debug(`已清除缓存: ${cacheKey}`);
  });
}

/**
 * 清除所有外部源缓存
 */
export function clearAllExternalCache(): void {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (
      key.startsWith(CACHE_KEY_PREFIX) ||
      LEGACY_CACHE_KEY_PREFIXES.some(prefix => key.startsWith(prefix))
    ) {
      localStorage.removeItem(key);
    }
  });
  console.debug('已清除所有外部源缓存');
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
    const cached = loadFromCache(cacheKey, mountSource);

    if (cached) {
      return { success: true, data: cached, fromCache: true };
    }
  }

  // 从网络加载
  try {
    const useCdn = getMountSourceUseCdnIndex(mountSource) ?? false;
    const response = await fetchWithBranchFallback(mountSource, useCdn);
    const data = normalizeShareFile(await response.json());

    if (!data) {
      throw new Error('外部源索引结构不符合要求');
    }

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
    return {
      nodes: externalData.nodes,
      rootNodeId: getShareFileRootId(externalData),
    };
  }

  // 查找 subPath 对应的节点
  const cleanSubPath = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const subPathNodeId = getShareFilePathIndex(externalData)[cleanSubPath];

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
function getRelativeExternalNodeId(
  oldId: string,
  externalRootId: string,
): string {
  if (oldId === externalRootId) return '';

  const rootPrefix = `${externalRootId}/`;

  if (externalRootId !== 'root' && oldId.startsWith(rootPrefix)) {
    return oldId.slice(rootPrefix.length);
  }

  return oldId;
}

function joinMountedNodeId(mountPointPath: string, relativeId: string): string {
  if (!relativeId) return mountPointPath;
  if (mountPointPath === 'root') return relativeId;

  return `${mountPointPath}/${relativeId}`.replace(/\/+/g, '/');
}

function getNodePathFromId(nodeId: string): string {
  return nodeId === 'root' ? '/' : `/${nodeId}`.replace(/\/+/g, '/');
}

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
    const relativeId = getRelativeExternalNodeId(oldId, externalRootId);
    idMapping[oldId] = joinMountedNodeId(mountPointPath, relativeId);
  });

  // 第二遍：重写节点
  Object.entries(externalNodes).forEach(([oldId, node]) => {
    const newId = idMapping[oldId];
    const newParentId = node.parent ? idMapping[node.parent] || null : null;

    const shouldAddFileUrl =
      node.type === 'file' &&
      !node.redirect_url &&
      ((shouldGenerateFileUrls && !node.url) ||
        !isUsableExternalFileUrl(node.url, mountSource));

    const rewrittenNode: ShareNode = {
      ...node,
      id: newId,
      parent: newParentId,
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
    pathIndex[getNodePathFromId(newId)] = newId;
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
  const mergedPathIndex = { ...getShareFilePathIndex(localData) };
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
    path_index: mergedPathIndex,
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
    if (node.type === 'folder' && getNodeMountSource(node)) {
      const mountSource = getNodeMountSource(node)!;

      mountPoints.push({
        mountPointId: nodeId,
        mountPointPath: nodeId,
        mountSource,
      });
    }
  });

  if (mountPoints.length === 0) {
    console.debug('未发现外部挂载源');
    return localData;
  }

  console.debug(`发现 ${mountPoints.length} 个外部挂载源，开始加载...`);

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
      getMountSourceSubPath(mountPoint.mountSource) || '/',
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
      !(getMountSourceUseCdnIndex(mountPoint.mountSource) ?? false),
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

  console.debug('外部源加载完成');
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

  if (!mountPointNode || !getNodeMountSource(mountPointNode)) {
    throw new Error(`节点不是挂载点: ${mountPointId}`);
  }

  const mountSource = getNodeMountSource(mountPointNode)!;

  // 清除缓存
  clearMountPointCache(mountPointId, mountSource);

  // 重新加载
  const result = await loadExternalShareFile(mountPointId, mountSource, false);

  if (!result.success || !result.data) {
    throw new Error(result.error || '加载失败');
  }

  // 过滤和重写节点
  const filtered = filterExternalNodes(
    result.data,
    getMountSourceSubPath(mountSource) || '/',
  );

  if (!filtered) {
    throw new Error('子路径不存在');
  }

  const rewritten = rewriteExternalNodes(
    filtered.nodes,
    filtered.rootNodeId,
    mountPointId,
    mountSource,
    !(getMountSourceUseCdnIndex(mountSource) ?? false),
  );

  // 合并到本地数据
  return mergeExternalNodes(localData, rewritten, mountPointId);
}

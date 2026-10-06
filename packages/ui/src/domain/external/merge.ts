import { getNodePathFromId } from '../paths';
import {
  getNodeMountSource,
  getShareFilePathIndex,
  getShareFileRootId,
} from '../share-file/accessors';
import type {
  MountSourceInfo,
  ShareFile,
  ShareNode,
} from '../share-file/schema';
import { filterExternalChildren } from './pathRules';
import { buildExternalFileUrl, isUsableExternalFileUrl } from './url';

export interface MountPointInfo {
  mountPointId: string;
  mountPointPath: string;
  mountSource: MountSourceInfo;
}

export interface ExternalNodesResult {
  nodes: Record<string, ShareNode>;
  pathIndex: Record<string, string>;
}

/**
 * 收集本地索引里声明的挂载点（挂载点 ID 即节点 ID，路径前缀也沿用节点 ID）。
 */
export function collectMountPoints(shareFile: ShareFile): MountPointInfo[] {
  const mountPoints: MountPointInfo[] = [];

  Object.entries(shareFile.nodes).forEach(([nodeId, node]) => {
    const mountSource = getNodeMountSource(node);

    if (node.type === 'folder' && mountSource) {
      mountPoints.push({
        mountPointId: nodeId,
        mountPointPath: nodeId,
        mountSource,
      });
    }
  });

  return mountPoints;
}

/**
 * 按 sub_path 过滤外部节点（sub_path 为 '/' 时取全量）。
 */
export function filterExternalNodes(
  externalData: ShareFile,
  subPath: string,
): { nodes: Record<string, ShareNode>; rootNodeId: string } | null {
  if (subPath === '/') {
    return {
      nodes: externalData.nodes,
      rootNodeId: getShareFileRootId(externalData),
    };
  }

  const cleanSubPath = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const subPathNodeId = getShareFilePathIndex(externalData)[cleanSubPath];
  const subPathNode = subPathNodeId
    ? externalData.nodes[subPathNodeId]
    : undefined;

  if (!subPathNodeId || !subPathNode) return null;

  const filteredNodes: Record<string, ShareNode> = {};

  function collectNodes(nodeId: string): void {
    const node = externalData.nodes[nodeId];

    if (!node) return;

    filteredNodes[nodeId] = node;
    (node.children ?? []).forEach((childId: string) => collectNodes(childId));
  }

  collectNodes(subPathNodeId);

  return { nodes: filteredNodes, rootNodeId: subPathNodeId };
}

/**
 * 去掉外部索引根节点前缀，得到「相对挂载根」的 ID（挂载根自身为空串）。
 * 与构建期 `generate-files-manifest.py` 的同名函数逐行对应。
 */
export function getRelativeExternalNodeId(
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

/** 把外部相对 ID 拼到挂载点 ID 上。 */
export function joinMountedNodeId(
  mountPointPath: string,
  relativeId: string,
): string {
  if (!relativeId) return mountPointPath;
  if (mountPointPath === 'root') return relativeId;

  return `${mountPointPath}/${relativeId}`.replace(/\/+/g, '/');
}

/**
 * 重写外部节点 ID / 父子引用 / 直链，并打上 external 与 mount_point 标记。
 *
 * 同时执行挂载源准入清单（`allow_paths` / `deny_paths`）过滤：此刻节点 ID 还是
 * 外挂索引自身的坐标系，与构建期比较的是同一串路径。过滤只影响前端呈现，
 * **不是安全边界**——被剔除的节点在外挂源上依旧公开可达。
 */
export function rewriteExternalNodes(
  externalNodes: Record<string, ShareNode>,
  externalRootId: string,
  mountPointPath: string,
  mountSource: MountSourceInfo,
  shouldGenerateFileUrls: boolean,
): ExternalNodesResult {
  const rewrittenNodes: Record<string, ShareNode> = {};
  const pathIndex: Record<string, string> = {};
  const idMapping: Record<string, string> = {};
  const admittedNodes = filterExternalChildren(
    externalNodes,
    externalRootId,
    mountSource.allow_paths,
    mountSource.deny_paths,
  );

  Object.keys(admittedNodes).forEach(oldId => {
    const relativeId = getRelativeExternalNodeId(oldId, externalRootId);

    idMapping[oldId] = joinMountedNodeId(mountPointPath, relativeId);
  });

  Object.entries(admittedNodes).forEach(([oldId, node]) => {
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
      children: (node.children ?? []).map(
        (childId: string) => idMapping[childId] || childId,
      ),
      source: 'external',
      mount_point: mountPointPath,
      ...(shouldAddFileUrl
        ? { url: buildExternalFileUrl(mountSource, oldId) }
        : {}),
    };

    rewrittenNodes[newId] = rewrittenNode;
    pathIndex[getNodePathFromId(newId)] = newId;
  });

  return { nodes: rewrittenNodes, pathIndex };
}

/**
 * 合并外部节点到本地索引：本地节点优先，同名目录合并 children。
 */
export function mergeExternalNodes(
  localData: ShareFile,
  externalResult: ExternalNodesResult,
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

    (externalResult.nodes[nodeId]?.children ?? []).forEach(childId =>
      blockExternalSubtree(childId),
    );
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

  Object.entries(externalResult.nodes).forEach(([nodeId, node]) => {
    if (blockedExternalNodeIds.has(nodeId)) return;

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
        children: [
          ...new Set([
            ...(existingNode.children ?? []),
            ...(node.children ?? []),
          ]),
        ],
      };

      return;
    }

    if (existingNode && isLocalNode(existingNode)) return;

    mergedNodes[nodeId] = node;
  });

  Object.entries(externalResult.pathIndex).forEach(([path, nodeId]) => {
    if (blockedExternalNodeIds.has(nodeId)) return;

    const existingNodeId = mergedPathIndex[path];

    if (!existingNodeId) {
      mergedPathIndex[path] = nodeId;

      return;
    }

    if (existingNodeId === nodeId) return;

    if (!isLocalNode(mergedNodes[existingNodeId])) {
      mergedPathIndex[path] = nodeId;
    }
  });

  const mountPointNode = mergedNodes[mountPointId];

  if (mountPointNode) {
    const externalRootChildren = Object.values(externalResult.nodes)
      .filter(
        node =>
          node.parent === mountPointId && !blockedExternalNodeIds.has(node.id),
      )
      .map(node => node.id);

    mergedNodes[mountPointId] = {
      ...mountPointNode,
      children: [
        ...new Set([
          ...(mountPointNode.children ?? []),
          ...externalRootChildren,
        ]),
      ],
    };
  }

  return {
    ...localData,
    nodes: mergedNodes,
    path_index: mergedPathIndex,
  };
}

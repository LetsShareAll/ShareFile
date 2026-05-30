import {
  DirectoryNode,
  FileNode,
  InfoFile,
  MountSourceInfo,
  ShareFile,
  ShareNode,
} from './schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(
  value: Record<string, unknown>,
  snakeKey: string,
  legacyCamelKey?: string,
): string | undefined {
  const snakeValue = value[snakeKey];
  const camelValue = legacyCamelKey ? value[legacyCamelKey] : undefined;
  if (typeof snakeValue === 'string') return snakeValue;
  if (typeof camelValue === 'string') return camelValue;
  return undefined;
}

function getBoolean(
  value: Record<string, unknown>,
  snakeKey: string,
  legacyCamelKey?: string,
): boolean | undefined {
  const snakeValue = value[snakeKey];
  const camelValue = legacyCamelKey ? value[legacyCamelKey] : undefined;
  if (typeof snakeValue === 'boolean') return snakeValue;
  if (typeof camelValue === 'boolean') return camelValue;
  return undefined;
}

export function normalizeMountSource(
  value: unknown,
): MountSourceInfo | undefined {
  if (!isRecord(value)) return undefined;

  const provider = getString(value, 'provider');
  const repository = getString(value, 'repository');

  if (provider !== 'github' || !repository) return undefined;

  const normalized: MountSourceInfo = {
    provider,
    repository,
    ...(getString(value, 'branch') && { branch: getString(value, 'branch') }),
    ...(getString(value, 'sub_path', 'subPath') && {
      sub_path: getString(value, 'sub_path', 'subPath'),
    }),
    ...(getString(value, 'access_cdn', 'accessCdn') && {
      access_cdn: getString(value, 'access_cdn', 'accessCdn'),
    }),
    ...(getBoolean(value, 'use_cdn_index', 'useCdnIndex') !== undefined && {
      use_cdn_index: getBoolean(value, 'use_cdn_index', 'useCdnIndex'),
    }),
  };

  return normalized;
}

function normalizeNode<T extends FileNode | DirectoryNode | ShareNode>(
  value: T,
): T {
  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...source };
  const mountSource = normalizeMountSource(
    source.mount_source ?? source.mountSource,
  );

  delete normalized.mountSource;

  if (mountSource) {
    normalized.mount_source = mountSource;
  }

  return normalized as T;
}

export function normalizeInfoFile(value: unknown): InfoFile | undefined {
  if (!isRecord(value) || !isRecord(value.self) || !isRecord(value.children)) {
    return undefined;
  }

  const children: Record<string, FileNode | DirectoryNode> = {};

  for (const [name, node] of Object.entries(value.children)) {
    if (isRecord(node)) {
      children[name] = normalizeNode(node as FileNode | DirectoryNode);
    }
  }

  return {
    self: normalizeNode(value.self as DirectoryNode),
    children,
  };
}

export function normalizeShareFile(value: unknown): ShareFile | undefined {
  if (!isRecord(value) || !isRecord(value.nodes)) return undefined;

  const rootId = getString(value, 'root_id', 'rootId');
  const rawPathIndex = value.path_index ?? value.pathIndex;
  const rawMountPoints = value.mount_points ?? value.mountPoints;

  if (!rootId || !isRecord(rawPathIndex)) return undefined;

  const pathIndex: Record<string, string> = {};
  const nodes: Record<string, ShareNode> = {};

  for (const [path, nodeId] of Object.entries(rawPathIndex)) {
    if (typeof nodeId === 'string') {
      pathIndex[path] = nodeId;
    }
  }

  for (const [nodeId, node] of Object.entries(value.nodes)) {
    if (isRecord(node)) {
      nodes[nodeId] = normalizeNode(node as unknown as ShareNode);
    }
  }

  return {
    root_id: rootId,
    path_index: pathIndex,
    nodes,
    ...(isRecord(rawMountPoints) && {
      mount_points: rawMountPoints as ShareFile['mount_points'],
    }),
  };
}

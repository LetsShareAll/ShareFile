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
  key: string,
): string | undefined {
  const currentValue = value[key];
  if (typeof currentValue === 'string') return currentValue;
  return undefined;
}

function getBoolean(
  value: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const currentValue = value[key];
  if (typeof currentValue === 'boolean') return currentValue;
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
    ...(getString(value, 'sub_path') && {
      sub_path: getString(value, 'sub_path'),
    }),
    ...(getString(value, 'access_cdn') && {
      access_cdn: getString(value, 'access_cdn'),
    }),
    ...(getBoolean(value, 'use_cdn_index') !== undefined && {
      use_cdn_index: getBoolean(value, 'use_cdn_index'),
    }),
  };

  return normalized;
}

function normalizeNode<T extends FileNode | DirectoryNode | ShareNode>(
  value: T,
): T {
  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...source };
  const mount_source = normalizeMountSource(source.mount_source);

  delete normalized.mount_source;

  if (mount_source) {
    normalized.mount_source = mount_source;
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

  const root_id = getString(value, 'root_id');
  const raw_path_index = value.path_index;
  const raw_mount_points = value.mount_points;

  if (!root_id || !isRecord(raw_path_index)) return undefined;

  const path_index: Record<string, string> = {};
  const nodes: Record<string, ShareNode> = {};

  for (const [path, node_id] of Object.entries(raw_path_index)) {
    if (typeof node_id === 'string') {
      path_index[path] = node_id;
    }
  }

  for (const [nodeId, node] of Object.entries(value.nodes)) {
    if (isRecord(node)) {
      nodes[nodeId] = normalizeNode(node as unknown as ShareNode);
    }
  }

  return {
    root_id,
    path_index,
    nodes,
    ...(isRecord(raw_mount_points) && {
      mount_points: raw_mount_points as ShareFile['mount_points'],
    }),
  };
}

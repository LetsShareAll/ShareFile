import type { MountSourceInfo, ShareFile, ShareNode } from './schema';

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

/** 路径规则列表：只保留字符串元素，非数组按未配置处理。 */
function getStringArray(
  value: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const currentValue = value[key];

  if (!Array.isArray(currentValue)) return undefined;

  return currentValue.filter(
    (item): item is string => typeof item === 'string',
  );
}

export function normalizeMountSource(
  value: unknown,
): MountSourceInfo | undefined {
  if (!isRecord(value)) return undefined;

  const provider = getString(value, 'provider');
  const repository = getString(value, 'repository');

  if (provider !== 'github' || !repository) return undefined;

  return {
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
    ...(getStringArray(value, 'allow_paths') && {
      allow_paths: getStringArray(value, 'allow_paths'),
    }),
    ...(getStringArray(value, 'deny_paths') && {
      deny_paths: getStringArray(value, 'deny_paths'),
    }),
  };
}

function normalizeChildren(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((child): child is string => typeof child === 'string');
}

function normalizeNode<T extends ShareNode>(value: T): T {
  const source = value as unknown as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    ...source,
    children: normalizeChildren(source.children),
  };
  const mountSource = normalizeMountSource(source.mount_source);
  // 脏数据（字符串或数字）不当作受限内容，缺失与非法值一律按未限制处理。
  const restricted = getBoolean(source, 'restricted');

  delete normalized.mount_source;

  if (mountSource) {
    normalized.mount_source = mountSource;
  }

  if (restricted === undefined) {
    delete normalized.restricted;
  } else {
    normalized.restricted = restricted;
  }

  return normalized as T;
}

/**
 * 归一化 share-file.json：结构不合法返回 undefined，逐条丢弃非法条目。
 */
export function normalizeShareFile(value: unknown): ShareFile | undefined {
  if (!isRecord(value) || !isRecord(value.nodes)) return undefined;

  const rootId = getString(value, 'root_id');
  const rawPathIndex = value.path_index;
  const rawMountPoints = value.mount_points;

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

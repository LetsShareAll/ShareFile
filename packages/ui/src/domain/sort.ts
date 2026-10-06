import type { ShareNode } from './share-file';

export type SortKey =
  | 'default'
  | 'type'
  | 'name'
  | 'size'
  | 'updated'
  | 'created';
export type SortDirection = 'asc' | 'desc';

export const SORT_KEYS: readonly SortKey[] = [
  'default',
  'type',
  'name',
  'size',
  'updated',
  'created',
];

/**
 * 每个排序键的默认方向：名称与类型升序，大小与时间降序（越大/越新在前）。
 */
export const DEFAULT_SORT_DIRECTIONS: Record<SortKey, SortDirection> = {
  default: 'asc',
  type: 'asc',
  name: 'asc',
  size: 'desc',
  updated: 'desc',
  created: 'desc',
};

export interface SortContext {
  /** 节点 ID → 路径，用于同值时的稳定兜底排序。 */
  getPath: (nodeId: string) => string;
  /** 展示用类型（与列表上显示的类型一致），供「文件类型」排序使用。 */
  getTypeClass?: (node: ShareNode) => string;
}

export function isSortKey(value: unknown): value is SortKey {
  return (
    typeof value === 'string' &&
    (SORT_KEYS as readonly string[]).includes(value)
  );
}

export function isSortDirection(value: unknown): value is SortDirection {
  return value === 'asc' || value === 'desc';
}

export function getDefaultSortDirection(key: SortKey): SortDirection {
  return DEFAULT_SORT_DIRECTIONS[key];
}

/** 文件夹永远在前，不随升降方向翻转。 */
function getFolderRank(node: ShareNode): number {
  return node.type === 'folder' ? 0 : 1;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'zh-CN');
}

/**
 * 缺失值（未知大小 / 没有时间）永远排在最后：该判定**不参与方向翻转**，
 * 否则降序时缺失项会被翻到最前。
 */
function compareOptional<T>(
  left: T | undefined | null,
  right: T | undefined | null,
  compare: (a: T, b: T) => number,
  factor: number,
): number {
  const leftMissing = left === undefined || left === null;
  const rightMissing = right === undefined || right === null;

  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;

  return compare(left as T, right as T) * factor;
}

function compareByKey(
  left: ShareNode,
  right: ShareNode,
  key: SortKey,
  context: SortContext,
  factor: number,
): number {
  switch (key) {
    case 'type': {
      const leftType = context.getTypeClass?.(left) ?? left.type;
      const rightType = context.getTypeClass?.(right) ?? right.type;

      return compareText(leftType, rightType) * factor;
    }

    case 'name':
      return compareText(left.name, right.name) * factor;

    case 'size':
      return compareOptional(left.size, right.size, (a, b) => a - b, factor);

    case 'updated':
      return compareOptional(
        left.updated_at,
        right.updated_at,
        (a, b) => a.localeCompare(b),
        factor,
      );

    case 'created':
      return compareOptional(
        left.created_at,
        right.created_at,
        (a, b) => a.localeCompare(b),
        factor,
      );

    default:
      return 0;
  }
}

/**
 * 排序节点：文件夹优先 → 主键（按方向）→ 同值按 zh-CN 路径稳定兜底。
 * `default` 保持索引里声明的目录顺序（降序即反转）。
 */
export function sortNodes(
  nodes: readonly ShareNode[],
  key: SortKey,
  direction: SortDirection,
  context: SortContext,
): ShareNode[] {
  if (key === 'default') {
    return direction === 'desc' ? [...nodes].reverse() : [...nodes];
  }

  const factor = direction === 'desc' ? -1 : 1;

  return [...nodes].sort((left, right) => {
    const folderDiff = getFolderRank(left) - getFolderRank(right);

    if (folderDiff !== 0) return folderDiff;

    const primary = compareByKey(left, right, key, context, factor);

    if (primary !== 0) return primary;

    return compareText(context.getPath(left.id), context.getPath(right.id));
  });
}

export interface SortPreference {
  key: SortKey;
  direction: SortDirection;
}

/** 解析持久化的偏好（`key:direction`），非法值回落到默认。 */
export function parseSortPreference(value: string | null): SortPreference {
  const fallback: SortPreference = { key: 'default', direction: 'asc' };

  if (!value) return fallback;

  const [rawKey, rawDirection] = value.split(':');

  if (!isSortKey(rawKey) || !isSortDirection(rawDirection)) return fallback;

  return { key: rawKey, direction: rawDirection };
}

export function formatSortPreference(preference: SortPreference): string {
  return `${preference.key}:${preference.direction}`;
}

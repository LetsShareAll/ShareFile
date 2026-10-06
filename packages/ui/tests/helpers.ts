import type { KeyValueStorage } from '@/domain/external';
import type {
  MountSourceInfo,
  ShareFile,
  ShareNode,
} from '@/domain/share-file';
import { normalizeShareFile } from '@/domain/share-file';

export function makeNode(
  id: string,
  type: ShareNode['type'],
  overrides: Partial<ShareNode> = {},
): ShareNode {
  return {
    id,
    name: id.split('/').pop() || id,
    type,
    parent: null,
    children: [],
    ...overrides,
  };
}

export function makeShareFile(
  nodes: ShareNode[],
  pathIndex: Record<string, string> = {},
  rootId = 'root',
): ShareFile {
  return {
    root_id: rootId,
    path_index: pathIndex,
    nodes: Object.fromEntries(nodes.map(node => [node.id, node])),
  };
}

export function githubSource(
  options: {
    repository?: string;
    branch?: string;
    sub_path?: string;
    access_cdn?: string;
    use_cdn_index?: boolean;
    allow_paths?: readonly string[];
    deny_paths?: readonly string[];
  } = {},
): MountSourceInfo {
  return {
    provider: 'github',
    repository: options.repository ?? 'owner/repo',
    ...(options.branch !== undefined && { branch: options.branch }),
    ...(options.sub_path !== undefined && { sub_path: options.sub_path }),
    ...(options.access_cdn !== undefined && { access_cdn: options.access_cdn }),
    ...(options.use_cdn_index !== undefined && {
      use_cdn_index: options.use_cdn_index,
    }),
    ...(options.allow_paths !== undefined && {
      allow_paths: options.allow_paths,
    }),
    ...(options.deny_paths !== undefined && { deny_paths: options.deny_paths }),
  };
}

export function requireShareFile(value: unknown): ShareFile {
  const result = normalizeShareFile(value);

  if (!result) throw new Error('expected a valid share file');

  return result;
}

export class MemoryStorage implements KeyValueStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  keys(): string[] {
    return [...this.store.keys()];
  }
}

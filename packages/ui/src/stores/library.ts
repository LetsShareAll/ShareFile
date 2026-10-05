import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';

import {
  buildExternalIndexUrl,
  clearMountPointCache,
  collectMountPoints,
  filterExternalNodes,
  getCacheKey,
  hasRequiredCdnFileUrls,
  loadExternalCache,
  mergeExternalNodes,
  rewriteExternalNodes,
  saveExternalCache,
  type MountPointInfo,
} from '../domain/external';
import { buildNodePathIndex, getNodePath } from '../domain/paths';
import { getErrorMessage } from '../domain/format';
import { searchNodes } from '../domain/search';
import { normalizeShareFile } from '../domain/share-file';
import type {
  MountSourceInfo,
  ShareFile,
  ShareNode,
} from '../domain/share-file';
import { getMountSourceUseCdnIndex } from '../domain/share-file';
import { fetchJson } from '../platform/http';
import { createLocalStorage } from '../platform/storage';

export type ExternalSourceState = 'idle' | 'loading' | 'success' | 'error';

export interface ExternalSourceStatus {
  mountPointId: string;
  state: ExternalSourceState;
  fromCache?: boolean;
  message?: string;
}

/**
 * 外部索引文件读取：按挂载配置选择 jsDelivr / raw / 自定义 CDN，分支按 main → master 回退。
 */
async function fetchExternalIndex(
  mountSource: MountSourceInfo,
): Promise<ShareFile> {
  const branches = mountSource.branch
    ? [mountSource.branch]
    : ['main', 'master'];
  const useCdnIndex = getMountSourceUseCdnIndex(mountSource) ?? false;
  let lastError: unknown = new Error('外部源不可用');

  for (const branch of branches) {
    try {
      const url = buildExternalIndexUrl(
        { ...mountSource, branch },
        useCdnIndex,
      );
      const data = normalizeShareFile(await fetchJson(url));

      if (!data) {
        throw new Error('外部源索引结构不符合要求');
      }

      if (useCdnIndex && !hasRequiredCdnFileUrls(data, mountSource)) {
        throw new Error('外部源索引缺少可用的 CDN 直链');
      }

      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export const useLibraryStore = defineStore('library', () => {
  const localStorage = createLocalStorage();

  const base = shallowRef<ShareFile | null>(null);
  const merged = shallowRef<ShareFile | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const externalStatuses = ref<Record<string, ExternalSourceStatus>>({});

  const data = computed<ShareFile | null>(() => merged.value ?? base.value);

  const nodePathIndex = computed(() =>
    data.value ? buildNodePathIndex(data.value) : new Map<string, string>(),
  );

  const rootId = computed(() => data.value?.root_id ?? 'root');
  const nodeCount = computed(() => Object.keys(data.value?.nodes ?? {}).length);

  const mountPoints = computed<MountPointInfo[]>(() =>
    base.value ? collectMountPoints(base.value) : [],
  );

  const hasExternalMounts = computed(() => mountPoints.value.length > 0);

  const externalLoading = computed(() =>
    Object.values(externalStatuses.value).some(
      status => status.state === 'loading',
    ),
  );

  function resolveNodeByPath(path: string): ShareNode | undefined {
    const nodeId = data.value?.path_index[path];

    return nodeId ? data.value?.nodes[nodeId] : undefined;
  }

  function getChildNodes(path: string): ShareNode[] {
    const nodes = data.value?.nodes;
    const node = resolveNodeByPath(path);

    if (!nodes || !node || node.type !== 'folder') return [];

    return node.children
      .map(childId => nodes[childId])
      .filter((child): child is ShareNode => Boolean(child));
  }

  function search(query: string): ShareNode[] {
    const current = data.value;

    if (!current) return [];

    return searchNodes(current, nodePathIndex.value, query)
      .map(nodeId => current.nodes[nodeId])
      .filter((node): node is ShareNode => Boolean(node));
  }

  function getNodePathById(nodeId: string): string {
    return getNodePath(nodePathIndex.value, nodeId);
  }

  async function loadExternalSources(useCache = true): Promise<void> {
    const localData = base.value;

    if (!localData) return;

    const points = collectMountPoints(localData);

    if (points.length === 0) return;

    const statuses: Record<string, ExternalSourceStatus> = {};

    points.forEach(point => {
      statuses[point.mountPointId] = {
        mountPointId: point.mountPointId,
        state: 'loading',
      };
    });
    externalStatuses.value = { ...statuses };

    let mergedData = localData;

    const results = await Promise.all(
      points.map(async point => {
        const cacheKey = getCacheKey(point.mountPointPath, point.mountSource);
        const cached = useCache
          ? loadExternalCache(localStorage, cacheKey, point.mountSource)
          : null;

        let externalData = cached;
        const fromCache = Boolean(cached);

        if (!externalData) {
          try {
            externalData = await fetchExternalIndex(point.mountSource);
            saveExternalCache(
              localStorage,
              cacheKey,
              externalData,
              point.mountPointPath,
              point.mountSource,
            );
          } catch (loadError) {
            statuses[point.mountPointId] = {
              mountPointId: point.mountPointId,
              state: 'error',
              message: getErrorMessage(loadError),
            };

            return null;
          }
        }

        const subPath = point.mountSource.sub_path ?? '/';
        const filtered = filterExternalNodes(externalData, subPath);

        if (!filtered) {
          statuses[point.mountPointId] = {
            mountPointId: point.mountPointId,
            state: 'error',
            message: '子路径不存在',
          };

          return null;
        }

        const rewritten = rewriteExternalNodes(
          filtered.nodes,
          filtered.rootNodeId,
          point.mountPointPath,
          point.mountSource,
          !(getMountSourceUseCdnIndex(point.mountSource) ?? false),
        );

        statuses[point.mountPointId] = {
          mountPointId: point.mountPointId,
          state: 'success',
          fromCache,
        };

        return { mountPointId: point.mountPointId, rewritten };
      }),
    );

    results.forEach(result => {
      if (result) {
        mergedData = mergeExternalNodes(
          mergedData,
          result.rewritten,
          result.mountPointId,
        );
      }
    });

    externalStatuses.value = { ...statuses };
    merged.value = mergedData;
  }

  async function loadIndex(fileName: string = __SHARE_FILE_NAME__) {
    loading.value = true;
    error.value = null;

    try {
      const raw = await fetchJson(`/assets/data/${fileName}`);
      const normalized = normalizeShareFile(raw);

      if (!normalized) {
        throw new Error('索引结构不符合要求');
      }

      base.value = normalized;
      merged.value = normalized;

      void loadExternalSources();
    } catch (loadError) {
      error.value = getErrorMessage(loadError);
    } finally {
      loading.value = false;
    }
  }

  async function refreshExternalSources(): Promise<void> {
    mountPoints.value.forEach(point =>
      clearMountPointCache(
        localStorage,
        point.mountPointPath,
        point.mountSource,
      ),
    );

    await loadExternalSources(false);
  }

  return {
    base,
    merged,
    loading,
    error,
    externalStatuses,
    data,
    nodePathIndex,
    rootId,
    nodeCount,
    mountPoints,
    hasExternalMounts,
    externalLoading,
    resolveNodeByPath,
    getChildNodes,
    getNodePathById,
    search,
    loadIndex,
    loadExternalSources,
    refreshExternalSources,
  };
});

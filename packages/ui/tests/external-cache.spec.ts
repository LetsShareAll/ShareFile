import { describe, expect, it } from 'vitest';

import {
  CACHE_KEY_PREFIX,
  CACHE_TTL_MS,
  LEGACY_CACHE_KEY_PREFIXES,
  clearAllExternalCache,
  clearMountPointCache,
  getCacheKey,
  getCacheKeyBody,
  getLegacyCacheKeys,
  isExternalCacheKey,
  loadExternalCache,
  saveExternalCache,
} from '@/domain/external';
import type { ShareFile } from '@/domain/share-file';

import {
  MemoryStorage,
  githubSource,
  makeNode,
  makeShareFile,
} from './helpers';

const now = new Date('2026-10-05T00:00:00.000Z');
const mountPoint = 'docs/mnt';
const source = githubSource();

function sampleShareFile(): ShareFile {
  return makeShareFile([
    makeNode('root', 'folder'),
    makeNode('a.txt', 'file', {
      url: 'https://cdn.jsdelivr.net/gh/owner/repo@main/a.txt',
    }),
  ]);
}

function futureIso(from: Date = now): string {
  return new Date(from.getTime() + CACHE_TTL_MS).toISOString();
}

describe('getCacheKey / getLegacyCacheKeys', () => {
  it('v2 缓存键前缀与内容', () => {
    const cacheKey = getCacheKey(mountPoint, source);

    expect(CACHE_KEY_PREFIX).toBe('share-file-external:v2:');
    expect(cacheKey).toBe(
      'share-file-external:v2:github:owner/repo:main:/:jsdelivr:false:docs/mnt',
    );
  });

  it('body 反映分支、sub_path、access_cdn 与 use_cdn_index', () => {
    const customSource = githubSource({
      branch: 'dev',
      sub_path: '/sub',
      access_cdn: 'raw',
      use_cdn_index: true,
    });

    expect(getCacheKeyBody(mountPoint, customSource)).toBe(
      'github:owner/repo:dev:/sub:raw:true:docs/mnt',
    );
  });

  it('legacy 键前缀为 share-file-external:', () => {
    const legacyKeys = getLegacyCacheKeys(mountPoint, source);

    expect(LEGACY_CACHE_KEY_PREFIXES).toEqual(['share-file-external:']);
    expect(legacyKeys).toEqual([
      'share-file-external:github:owner/repo:main:/:jsdelivr:false:docs/mnt',
    ]);
  });

  it('isExternalCacheKey 只认本模块前缀', () => {
    expect(isExternalCacheKey(getCacheKey(mountPoint, source))).toBe(true);
    expect(isExternalCacheKey(getLegacyCacheKeys(mountPoint, source)[0])).toBe(
      true,
    );
    expect(isExternalCacheKey('share-file:other')).toBe(false);
    expect(isExternalCacheKey('theme')).toBe(false);
  });
});

describe('saveExternalCache / loadExternalCache 往返', () => {
  it('保存后可在 TTL 内读回相同数据', () => {
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, source);
    const data = sampleShareFile();

    saveExternalCache(storage, cacheKey, data, mountPoint, source, now);

    const raw = storage.getItem(cacheKey);

    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '{}')).toMatchObject({
      cached_at: now.toISOString(),
      expires_at: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
      mount_point: mountPoint,
      source: {
        provider: 'github',
        repository: 'owner/repo',
        branch: 'main',
      },
    });

    expect(
      loadExternalCache(storage, cacheKey, source, new Date(now.getTime() + 1)),
    ).toEqual(data);
  });

  it('恰好在过期时刻仍可读回', () => {
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, source);

    saveExternalCache(
      storage,
      cacheKey,
      sampleShareFile(),
      mountPoint,
      source,
      now,
    );

    expect(
      loadExternalCache(
        storage,
        cacheKey,
        source,
        new Date(now.getTime() + CACHE_TTL_MS),
      ),
    ).toEqual(sampleShareFile());
  });

  it('超过 12 小时后返回 null 并删除键', () => {
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, source);

    saveExternalCache(
      storage,
      cacheKey,
      sampleShareFile(),
      mountPoint,
      source,
      now,
    );

    expect(
      loadExternalCache(
        storage,
        cacheKey,
        source,
        new Date(now.getTime() + CACHE_TTL_MS + 1),
      ),
    ).toBeNull();
    expect(storage.getItem(cacheKey)).toBeNull();
  });
});

describe('loadExternalCache 的结构校验', () => {
  it('expires_at 缺失时视为过期并删除键', () => {
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, source);

    storage.setItem(
      cacheKey,
      JSON.stringify({
        data: sampleShareFile(),
        cached_at: now.toISOString(),
        mount_point: mountPoint,
      }),
    );

    expect(loadExternalCache(storage, cacheKey, source, now)).toBeNull();
    expect(storage.getItem(cacheKey)).toBeNull();
  });

  it('expiresAt 驼峰字段向后兼容', () => {
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, source);

    storage.setItem(
      cacheKey,
      JSON.stringify({ data: sampleShareFile(), expiresAt: futureIso() }),
    );

    expect(loadExternalCache(storage, cacheKey, source, now)).toEqual(
      sampleShareFile(),
    );
    expect(storage.getItem(cacheKey)).not.toBeNull();
  });

  it('data 结构非法时返回 null 并删除键', () => {
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, source);

    storage.setItem(
      cacheKey,
      JSON.stringify({
        data: { root_id: 'root', nodes: 'nope' },
        expires_at: futureIso(),
      }),
    );

    expect(loadExternalCache(storage, cacheKey, source, now)).toBeNull();
    expect(storage.getItem(cacheKey)).toBeNull();
  });

  it('内容不是合法 JSON 时返回 null 且不清除键', () => {
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, source);

    storage.setItem(cacheKey, '{oops');

    expect(loadExternalCache(storage, cacheKey, source, now)).toBeNull();
    expect(storage.getItem(cacheKey)).toBe('{oops');
  });

  it('键不存在时返回 null', () => {
    expect(
      loadExternalCache(
        new MemoryStorage(),
        getCacheKey(mountPoint, source),
        source,
        now,
      ),
    ).toBeNull();
  });
});

describe('loadExternalCache 的 CDN 直链校验', () => {
  it('use_cdn_index 为 true 且文件直链缺失时丢弃缓存', () => {
    const cdnSource = githubSource({ use_cdn_index: true });
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, cdnSource);
    const data = makeShareFile([
      makeNode('root', 'folder'),
      makeNode('a.txt', 'file'),
    ]);

    saveExternalCache(storage, cacheKey, data, mountPoint, cdnSource, now);

    expect(loadExternalCache(storage, cacheKey, cdnSource, now)).toBeNull();
    expect(storage.getItem(cacheKey)).toBeNull();
  });

  it('use_cdn_index 为 true 且直链前缀不符时丢弃缓存', () => {
    const cdnSource = githubSource({ use_cdn_index: true });
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, cdnSource);
    const data = makeShareFile([
      makeNode('root', 'folder'),
      makeNode('a.txt', 'file', { url: 'https://evil.example.com/a.txt' }),
    ]);

    saveExternalCache(storage, cacheKey, data, mountPoint, cdnSource, now);

    expect(loadExternalCache(storage, cacheKey, cdnSource, now)).toBeNull();
    expect(storage.getItem(cacheKey)).toBeNull();
  });

  it('直链前缀匹配的 CDN 索引可以读回', () => {
    const cdnSource = githubSource({ use_cdn_index: true });
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, cdnSource);
    const data = makeShareFile([
      makeNode('root', 'folder'),
      makeNode('a.txt', 'file', {
        url: 'https://cdn.jsdelivr.net/gh/owner/repo@main/a.txt',
      }),
    ]);

    saveExternalCache(storage, cacheKey, data, mountPoint, cdnSource, now);

    expect(loadExternalCache(storage, cacheKey, cdnSource, now)).toEqual(data);
  });

  it('未开启 CDN 索引时不校验直链，缓存可以命中', () => {
    const storage = new MemoryStorage();
    const cacheKey = getCacheKey(mountPoint, source);
    const data = makeShareFile([
      makeNode('root', 'folder'),
      makeNode('a.txt', 'file'),
    ]);

    saveExternalCache(storage, cacheKey, data, mountPoint, source, now);

    // 默认挂载的索引本身不带 url，若在此处校验直链会让 12h 缓存永不命中。
    expect(loadExternalCache(storage, cacheKey, source, now)).toEqual(data);
  });
});

describe('clearMountPointCache', () => {
  it('同时清理 v2 与 legacy 键，其他挂载点的键不受影响', () => {
    const storage = new MemoryStorage();
    const v2Key = getCacheKey(mountPoint, source);
    const legacyKey = getLegacyCacheKeys(mountPoint, source)[0];
    const otherKey = getCacheKey('other/mnt', source);

    [v2Key, legacyKey, otherKey].forEach(key => storage.setItem(key, 'cached'));

    clearMountPointCache(storage, mountPoint, source);

    expect(storage.getItem(v2Key)).toBeNull();
    expect(storage.getItem(legacyKey)).toBeNull();
    expect(storage.getItem(otherKey)).toBe('cached');
  });
});

describe('clearAllExternalCache', () => {
  it('只清理本模块前缀的键，不误伤其它键', () => {
    const storage = new MemoryStorage();
    const v2Key = getCacheKey(mountPoint, source);
    const legacyKey = getLegacyCacheKeys(mountPoint, source)[0];
    const untouched = [
      'share-file:share-file.json',
      'share-file-external-v2:keep',
      'theme',
    ];

    [v2Key, legacyKey, ...untouched].forEach(key =>
      storage.setItem(key, 'cached'),
    );

    clearAllExternalCache(storage);

    expect(storage.keys()).toEqual(untouched);
  });
});

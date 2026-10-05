import { describe, expect, it } from 'vitest';

import { normalizeMountSource, normalizeShareFile } from '@/domain/share-file';

import { requireShareFile } from './helpers';

function makeRawShareFile(overrides: Record<string, unknown> = {}) {
  return {
    root_id: 'root',
    path_index: { '/': 'root' },
    nodes: { root: { id: 'root', name: 'root', type: 'folder' } },
    ...overrides,
  };
}

function nodeWithMountSource(mountSource: unknown) {
  return makeRawShareFile({
    nodes: {
      mnt: {
        id: 'mnt',
        name: 'mnt',
        type: 'folder',
        mount_source: mountSource,
      },
    },
  });
}

describe('normalizeShareFile', () => {
  it('合法数据保留 root_id、path_index 与 nodes', () => {
    const result = requireShareFile(
      makeRawShareFile({
        path_index: { '/': 'root', '/docs': 'docs' },
        nodes: {
          root: {
            id: 'root',
            name: 'root',
            type: 'folder',
            children: ['docs'],
          },
          docs: { id: 'docs', name: 'docs', type: 'folder', children: [] },
        },
      }),
    );

    expect(result.root_id).toBe('root');
    expect(result.path_index).toEqual({ '/': 'root', '/docs': 'docs' });
    expect(Object.keys(result.nodes)).toEqual(['root', 'docs']);
    expect(result.nodes.docs.name).toBe('docs');
    expect(result.nodes.root.children).toEqual(['docs']);
  });

  it('整体不是对象时返回 undefined', () => {
    expect(normalizeShareFile(null)).toBeUndefined();
    expect(normalizeShareFile('nope')).toBeUndefined();
    expect(normalizeShareFile([])).toBeUndefined();
  });

  it('root_id 缺失、非字符串或空串时返回 undefined', () => {
    expect(
      normalizeShareFile(makeRawShareFile({ root_id: undefined })),
    ).toBeUndefined();
    expect(
      normalizeShareFile(makeRawShareFile({ root_id: 123 })),
    ).toBeUndefined();
    expect(
      normalizeShareFile(makeRawShareFile({ root_id: '' })),
    ).toBeUndefined();
  });

  it('nodes 不是对象时返回 undefined', () => {
    expect(normalizeShareFile(makeRawShareFile({ nodes: [] }))).toBeUndefined();
    expect(
      normalizeShareFile(makeRawShareFile({ nodes: null })),
    ).toBeUndefined();
    expect(
      normalizeShareFile(makeRawShareFile({ nodes: 'nope' })),
    ).toBeUndefined();
  });

  it('path_index 不是对象时返回 undefined', () => {
    expect(
      normalizeShareFile(makeRawShareFile({ path_index: [] })),
    ).toBeUndefined();
    expect(
      normalizeShareFile(makeRawShareFile({ path_index: 'nope' })),
    ).toBeUndefined();
  });

  it('丢弃 path_index 中值不是字符串的条目', () => {
    const result = requireShareFile(
      makeRawShareFile({
        path_index: {
          '/a': 'a',
          '/b': 2,
          '/c': null,
          '/d': { id: 'd' },
          '/e': ['e'],
        },
      }),
    );

    expect(result.path_index).toEqual({ '/a': 'a' });
  });

  it('丢弃 nodes 中不是对象的条目', () => {
    const result = requireShareFile(
      makeRawShareFile({
        nodes: {
          keep: { id: 'keep', name: 'keep', type: 'file' },
          text: 'nope',
          list: [],
          empty: null,
        },
      }),
    );

    expect(Object.keys(result.nodes)).toEqual(['keep']);
  });
});

describe('normalizeShareFile 的 mount_source 归一化', () => {
  it('provider 不是 github 时剔除 mount_source', () => {
    const result = requireShareFile(
      nodeWithMountSource({ provider: 'gitlab', repository: 'o/r' }),
    );

    expect(result.nodes.mnt.mount_source).toBeUndefined();
    expect(Object.keys(result.nodes.mnt)).not.toContain('mount_source');
  });

  it('repository 缺失、非字符串或空串时剔除 mount_source', () => {
    expect(
      requireShareFile(nodeWithMountSource({ provider: 'github' })).nodes.mnt
        .mount_source,
    ).toBeUndefined();
    expect(
      requireShareFile(
        nodeWithMountSource({ provider: 'github', repository: 42 }),
      ).nodes.mnt.mount_source,
    ).toBeUndefined();
    expect(
      requireShareFile(
        nodeWithMountSource({ provider: 'github', repository: '' }),
      ).nodes.mnt.mount_source,
    ).toBeUndefined();
  });

  it('mount_source 不是对象时剔除', () => {
    expect(
      requireShareFile(nodeWithMountSource('github')).nodes.mnt.mount_source,
    ).toBeUndefined();
    expect(
      requireShareFile(nodeWithMountSource([])).nodes.mnt.mount_source,
    ).toBeUndefined();
    expect(
      requireShareFile(nodeWithMountSource(null)).nodes.mnt.mount_source,
    ).toBeUndefined();
  });

  it('合法 mount_source 只保留白名单字段', () => {
    const result = requireShareFile(
      nodeWithMountSource({
        provider: 'github',
        repository: 'o/r',
        branch: 'dev',
        sub_path: '/docs',
        access_cdn: 'raw',
        use_cdn_index: true,
        extra: 'ignored',
      }),
    );

    expect(result.nodes.mnt.mount_source).toEqual({
      provider: 'github',
      repository: 'o/r',
      branch: 'dev',
      sub_path: '/docs',
      access_cdn: 'raw',
      use_cdn_index: true,
    });
  });

  it('空字符串与非法布尔值不会进入归一化结果', () => {
    const result = requireShareFile(
      nodeWithMountSource({
        provider: 'github',
        repository: 'o/r',
        branch: '',
        sub_path: '',
        access_cdn: '',
        use_cdn_index: 'yes',
      }),
    );

    expect(result.nodes.mnt.mount_source).toEqual({
      provider: 'github',
      repository: 'o/r',
    });
  });
});

describe('normalizeMountSource', () => {
  it('非对象输入返回 undefined', () => {
    expect(normalizeMountSource(undefined)).toBeUndefined();
    expect(normalizeMountSource('github/repo')).toBeUndefined();
  });

  it('合法输入返回归一化对象', () => {
    expect(
      normalizeMountSource({
        provider: 'github',
        repository: 'o/r',
        use_cdn_index: false,
      }),
    ).toEqual({ provider: 'github', repository: 'o/r', use_cdn_index: false });
  });
});

describe('normalizeShareFile 的 mount_points', () => {
  it('未提供时不写入该字段', () => {
    const result = requireShareFile(makeRawShareFile());

    expect('mount_points' in result).toBe(false);
  });

  it('提供对象时原样保留', () => {
    const mountPoints = {
      mnt: { repository: 'o/r', branch: 'main', provider: 'github' },
    };
    const result = requireShareFile(
      makeRawShareFile({ mount_points: mountPoints }),
    );

    expect(result.mount_points).toEqual(mountPoints);
  });

  it('非对象时忽略该字段', () => {
    const result = requireShareFile(makeRawShareFile({ mount_points: [] }));

    expect('mount_points' in result).toBe(false);
  });
});

describe('normalizeShareFile 的 children 归一化', () => {
  it('children 缺失时归一为空数组', () => {
    const result = requireShareFile(
      makeRawShareFile({
        nodes: { root: { id: 'root', name: 'root', type: 'folder' } },
      }),
    );

    expect(result.nodes.root.children).toEqual([]);
  });

  it('children 中的非字符串项被丢弃', () => {
    const result = requireShareFile(
      makeRawShareFile({
        nodes: {
          root: {
            id: 'root',
            name: 'root',
            type: 'folder',
            children: ['a', 1, null, 'b'],
          },
        },
      }),
    );

    expect(result.nodes.root.children).toEqual(['a', 'b']);
  });

  it('children 不是数组时归一为空数组', () => {
    const result = requireShareFile(
      makeRawShareFile({
        nodes: {
          root: { id: 'root', name: 'root', type: 'folder', children: 'a' },
        },
      }),
    );

    expect(result.nodes.root.children).toEqual([]);
  });
});

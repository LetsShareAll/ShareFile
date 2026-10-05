import { describe, expect, it } from 'vitest';

import {
  collectMountPoints,
  filterExternalNodes,
  getRelativeExternalNodeId,
  joinMountedNodeId,
  mergeExternalNodes,
  rewriteExternalNodes,
} from '@/domain/external';
import type { ExternalNodesResult } from '@/domain/external';
import type { ShareNode } from '@/domain/share-file';

import { githubSource, makeNode, makeShareFile } from './helpers';

const mountSource = githubSource();

function standardExternalTree(): Record<string, ShareNode> {
  return {
    root: makeNode('root', 'folder', { children: ['docs'] }),
    docs: makeNode('docs', 'folder', {
      parent: 'root',
      children: ['docs/a.txt'],
    }),
    'docs/a.txt': makeNode('docs/a.txt', 'file', { parent: 'docs' }),
  };
}

describe('collectMountPoints', () => {
  const shareFile = makeShareFile([
    makeNode('root', 'folder', { children: ['mnt', 'plain'] }),
    makeNode('mnt', 'folder', { parent: 'root', mount_source: mountSource }),
    makeNode('plain', 'folder', { parent: 'root' }),
    makeNode('mnt/file.txt', 'file', {
      parent: 'mnt',
      mount_source: mountSource,
    }),
  ]);

  it('只收集带 mount_source 的 folder 节点', () => {
    expect(collectMountPoints(shareFile)).toEqual([
      {
        mountPointId: 'mnt',
        mountPointPath: 'mnt',
        mountSource,
      },
    ]);
  });

  it('没有挂载点时返回空数组', () => {
    expect(
      collectMountPoints(makeShareFile([makeNode('root', 'folder')])),
    ).toEqual([]);
  });
});

describe('filterExternalNodes', () => {
  const externalData = makeShareFile(
    [
      makeNode('root', 'folder', { children: ['docs', 'top.txt'] }),
      makeNode('docs', 'folder', {
        parent: 'root',
        children: ['docs/a.txt', 'docs/sub'],
      }),
      makeNode('docs/a.txt', 'file', { parent: 'docs' }),
      makeNode('docs/sub', 'folder', {
        parent: 'docs',
        children: ['docs/sub/b.txt'],
      }),
      makeNode('docs/sub/b.txt', 'file', { parent: 'docs/sub' }),
      makeNode('top.txt', 'file', { parent: 'root' }),
    ],
    {
      '/': 'root',
      '/docs': 'docs',
      '/docs/a.txt': 'docs/a.txt',
      '/docs/sub': 'docs/sub',
      '/docs/sub/b.txt': 'docs/sub/b.txt',
      '/top.txt': 'top.txt',
    },
  );

  it("sub_path 为 '/' 时返回全量节点与根 ID", () => {
    const result = filterExternalNodes(externalData, '/');

    expect(result?.rootNodeId).toBe('root');
    expect(Object.keys(result?.nodes ?? {})).toEqual([
      'root',
      'docs',
      'docs/a.txt',
      'docs/sub',
      'docs/sub/b.txt',
      'top.txt',
    ]);
  });

  it('sub_path 只收集子树节点', () => {
    const result = filterExternalNodes(externalData, '/docs');

    expect(result?.rootNodeId).toBe('docs');
    expect(Object.keys(result?.nodes ?? {})).toEqual([
      'docs',
      'docs/a.txt',
      'docs/sub',
      'docs/sub/b.txt',
    ]);
  });

  it('sub_path 缺少前导斜杠时自动补齐', () => {
    expect(filterExternalNodes(externalData, 'docs')?.rootNodeId).toBe('docs');
  });

  it('sub_path 不存在时返回 null', () => {
    expect(filterExternalNodes(externalData, '/missing')).toBeNull();
  });

  it('path_index 指向的节点缺失时返回 null', () => {
    const broken = makeShareFile([makeNode('root', 'folder')], {
      '/ghost': 'ghost',
    });

    expect(filterExternalNodes(broken, '/ghost')).toBeNull();
  });
});

describe('getRelativeExternalNodeId', () => {
  it('外部根节点返回空串', () => {
    expect(getRelativeExternalNodeId('docs', 'docs')).toBe('');
  });

  it('非 root 外部根剥离前缀', () => {
    expect(getRelativeExternalNodeId('docs/a.txt', 'docs')).toBe('a.txt');
    expect(getRelativeExternalNodeId('docs/sub/b.txt', 'docs')).toBe(
      'sub/b.txt',
    );
  });

  it('外部根为 root 时保留原始 ID', () => {
    expect(getRelativeExternalNodeId('docs/a.txt', 'root')).toBe('docs/a.txt');
  });

  it('与外部根无关的 ID 原样返回', () => {
    expect(getRelativeExternalNodeId('other', 'docs')).toBe('other');
  });
});

describe('joinMountedNodeId', () => {
  it('相对 ID 为空时返回挂载点路径本身', () => {
    expect(joinMountedNodeId('mnt', '')).toBe('mnt');
  });

  it('挂载点为 root 时直接使用相对 ID', () => {
    expect(joinMountedNodeId('root', 'docs/a.txt')).toBe('docs/a.txt');
  });

  it('普通挂载点拼接并合并重复斜杠', () => {
    expect(joinMountedNodeId('mnt', 'docs/a.txt')).toBe('mnt/docs/a.txt');
    expect(joinMountedNodeId('mnt/', '/docs')).toBe('mnt/docs');
  });
});

describe('rewriteExternalNodes', () => {
  it('重写 id/parent/children，打上 external 与 mount_point 标记并生成路径索引', () => {
    const result = rewriteExternalNodes(
      standardExternalTree(),
      'root',
      'mnt',
      mountSource,
      false,
    );

    expect(Object.keys(result.nodes)).toEqual([
      'mnt',
      'mnt/docs',
      'mnt/docs/a.txt',
    ]);
    expect(result.nodes['mnt']).toMatchObject({
      id: 'mnt',
      parent: null,
      children: ['mnt/docs'],
      source: 'external',
      mount_point: 'mnt',
    });
    expect(result.nodes['mnt/docs']).toMatchObject({
      id: 'mnt/docs',
      parent: 'mnt',
      children: ['mnt/docs/a.txt'],
    });
    expect(result.nodes['mnt/docs/a.txt']).toMatchObject({
      id: 'mnt/docs/a.txt',
      parent: 'mnt/docs',
      children: [],
    });
    expect(result.pathIndex).toEqual({
      '/mnt': 'mnt',
      '/mnt/docs': 'mnt/docs',
      '/mnt/docs/a.txt': 'mnt/docs/a.txt',
    });
  });

  it('文件节点缺少直链时按旧 ID 生成外链', () => {
    const result = rewriteExternalNodes(
      standardExternalTree(),
      'root',
      'mnt',
      mountSource,
      false,
    );

    expect(result.nodes['mnt/docs/a.txt'].url).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@main/docs/a.txt',
    );
  });

  it('已有合法直链时保留原值', () => {
    const url = 'https://cdn.jsdelivr.net/gh/owner/repo@main/docs/a.txt';
    const tree = standardExternalTree();

    tree['docs/a.txt'] = makeNode('docs/a.txt', 'file', {
      parent: 'docs',
      url,
    });

    const result = rewriteExternalNodes(tree, 'root', 'mnt', mountSource, true);

    expect(result.nodes['mnt/docs/a.txt'].url).toBe(url);
  });

  it('直链前缀不符时覆盖为生成地址', () => {
    const tree = standardExternalTree();

    tree['docs/a.txt'] = makeNode('docs/a.txt', 'file', {
      parent: 'docs',
      url: 'https://evil.example.com/a.txt',
    });

    const result = rewriteExternalNodes(
      tree,
      'root',
      'mnt',
      mountSource,
      false,
    );

    expect(result.nodes['mnt/docs/a.txt'].url).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@main/docs/a.txt',
    );
  });

  it('带 redirect_url 的虚拟文件节点不补直链', () => {
    const tree = standardExternalTree();

    tree['docs/a.txt'] = makeNode('docs/a.txt', 'file', {
      parent: 'docs',
      redirect_url: 'https://example.com/virtual',
    });

    const result = rewriteExternalNodes(
      tree,
      'root',
      'mnt',
      mountSource,
      false,
    );

    expect(result.nodes['mnt/docs/a.txt'].url).toBeUndefined();
    expect(result.nodes['mnt/docs/a.txt'].redirect_url).toBe(
      'https://example.com/virtual',
    );
  });

  it('非 root 的外部根重写为挂载点根', () => {
    const result = rewriteExternalNodes(
      {
        docs: makeNode('docs', 'folder', { children: ['docs/a.txt'] }),
        'docs/a.txt': makeNode('docs/a.txt', 'file', { parent: 'docs' }),
      },
      'docs',
      'mnt',
      mountSource,
      false,
    );

    expect(Object.keys(result.nodes)).toEqual(['mnt', 'mnt/a.txt']);
    expect(result.nodes['mnt']).toMatchObject({
      id: 'mnt',
      parent: null,
      children: ['mnt/a.txt'],
    });
    expect(result.nodes['mnt/a.txt']).toMatchObject({
      id: 'mnt/a.txt',
      parent: 'mnt',
    });
  });

  it('挂载点为 root 时不加前缀', () => {
    const result = rewriteExternalNodes(
      standardExternalTree(),
      'root',
      'root',
      mountSource,
      false,
    );

    expect(Object.keys(result.nodes)).toEqual(['root', 'docs', 'docs/a.txt']);
    expect(result.nodes.docs.parent).toBe('root');
    expect(result.nodes['docs/a.txt'].parent).toBe('docs');
  });
});

describe('mergeExternalNodes', () => {
  it('无冲突时写入外部节点并保留本地节点', () => {
    const localData = makeShareFile(
      [
        makeNode('root', 'folder', { children: ['mnt', 'local.txt'] }),
        makeNode('mnt', 'folder', { parent: 'root' }),
        makeNode('local.txt', 'file', { parent: 'root' }),
      ],
      { '/': 'root', '/mnt': 'mnt', '/local.txt': 'local.txt' },
    );
    const external = rewriteExternalNodes(
      standardExternalTree(),
      'root',
      'mnt',
      mountSource,
      false,
    );

    const merged = mergeExternalNodes(localData, external, 'mnt');

    expect(merged.root_id).toBe('root');
    expect(merged.nodes['local.txt']).toBe(localData.nodes['local.txt']);
    expect(merged.nodes['mnt/docs']).toMatchObject({
      source: 'external',
      mount_point: 'mnt',
      parent: 'mnt',
    });
    expect(merged.nodes['mnt/docs/a.txt']).toMatchObject({
      source: 'external',
      type: 'file',
      parent: 'mnt/docs',
    });
    expect(merged.path_index['/mnt/docs']).toBe('mnt/docs');
    expect(merged.path_index['/mnt/docs/a.txt']).toBe('mnt/docs/a.txt');
    expect(merged.nodes['mnt'].children).toEqual(['mnt/docs']);
    expect(merged.nodes['mnt'].source).toBe('local');
  });

  it('本地文件与外部同名目录冲突时阻断整个外部子树', () => {
    const localData = makeShareFile(
      [
        makeNode('root', 'folder', { children: ['mnt'] }),
        makeNode('mnt', 'folder', { parent: 'root', children: ['mnt/docs'] }),
        makeNode('mnt/docs', 'file', { parent: 'mnt', source: 'local' }),
      ],
      { '/': 'root', '/mnt': 'mnt', '/mnt/docs': 'mnt/docs' },
    );
    const external = rewriteExternalNodes(
      standardExternalTree(),
      'root',
      'mnt',
      mountSource,
      false,
    );

    const merged = mergeExternalNodes(localData, external, 'mnt');

    expect(merged.nodes['mnt/docs']).toBe(localData.nodes['mnt/docs']);
    expect(merged.nodes['mnt/docs'].type).toBe('file');
    expect(merged.nodes['mnt/docs/a.txt']).toBeUndefined();
    expect(merged.path_index['/mnt/docs']).toBe('mnt/docs');
    expect(merged.path_index['/mnt/docs/a.txt']).toBeUndefined();
    expect(merged.nodes['mnt'].children).toEqual(['mnt/docs']);
  });

  it('双方都是 folder 时合并 children 并保留本地字段', () => {
    const localData = makeShareFile(
      [
        makeNode('root', 'folder', { children: ['mnt'] }),
        makeNode('mnt', 'folder', { parent: 'root', children: ['mnt/docs'] }),
        makeNode('mnt/docs', 'folder', {
          parent: 'mnt',
          children: ['mnt/docs/local.txt', 'mnt/docs/shared.txt'],
          description: '本地描述',
        }),
      ],
      { '/': 'root', '/mnt': 'mnt', '/mnt/docs': 'mnt/docs' },
    );
    const external = rewriteExternalNodes(
      {
        root: makeNode('root', 'folder', { children: ['docs'] }),
        docs: makeNode('docs', 'folder', {
          parent: 'root',
          children: ['docs/shared.txt', 'docs/a.txt'],
          description: '外部描述',
        }),
        'docs/shared.txt': makeNode('docs/shared.txt', 'file', {
          parent: 'docs',
        }),
        'docs/a.txt': makeNode('docs/a.txt', 'file', { parent: 'docs' }),
      },
      'root',
      'mnt',
      mountSource,
      false,
    );

    const merged = mergeExternalNodes(localData, external, 'mnt');

    expect(merged.nodes['mnt/docs']).toMatchObject({
      type: 'folder',
      source: 'local',
      description: '本地描述',
      children: ['mnt/docs/local.txt', 'mnt/docs/shared.txt', 'mnt/docs/a.txt'],
    });
    expect(merged.nodes['mnt/docs/a.txt']).toMatchObject({
      source: 'external',
      parent: 'mnt/docs',
    });
  });

  it('同名路径冲突时本地优先', () => {
    const localData = makeShareFile(
      [
        makeNode('root', 'folder'),
        makeNode('local-docs', 'folder', { parent: 'root' }),
        makeNode('mnt', 'folder', { parent: 'root' }),
      ],
      { '/': 'root', '/docs': 'local-docs', '/mnt': 'mnt' },
    );
    const external: ExternalNodesResult = {
      nodes: {
        mnt: makeNode('mnt', 'folder', {
          source: 'external',
          mount_point: 'mnt',
          children: ['mnt/docs'],
        }),
        'mnt/docs': makeNode('mnt/docs', 'folder', {
          parent: 'mnt',
          source: 'external',
          mount_point: 'mnt',
        }),
      },
      pathIndex: { '/docs': 'mnt/docs', '/mnt/docs': 'mnt/docs' },
    };

    const merged = mergeExternalNodes(localData, external, 'mnt');

    expect(merged.path_index['/docs']).toBe('local-docs');
    expect(merged.path_index['/mnt/docs']).toBe('mnt/docs');
  });

  it('路径冲突方不是本地节点时被外部覆盖', () => {
    const localData = makeShareFile(
      [
        makeNode('root', 'folder'),
        makeNode('mnt/old', 'folder', {
          parent: 'root',
          source: 'external',
          mount_point: 'mnt',
        }),
      ],
      { '/': 'root', '/docs': 'mnt/old' },
    );
    const external: ExternalNodesResult = {
      nodes: {
        'mnt/new': makeNode('mnt/new', 'folder', {
          source: 'external',
          mount_point: 'mnt',
        }),
      },
      pathIndex: { '/docs': 'mnt/new' },
    };

    const merged = mergeExternalNodes(localData, external, 'mnt');

    expect(merged.path_index['/docs']).toBe('mnt/new');
    expect(merged.nodes['mnt/old']).toBe(localData.nodes['mnt/old']);
  });

  it('挂载点 children 与外部根子节点取去重并集', () => {
    const localData = makeShareFile(
      [
        makeNode('root', 'folder', { children: ['mnt'] }),
        makeNode('mnt', 'folder', {
          parent: 'root',
          children: ['mnt/docs', 'mnt/keep.txt'],
        }),
        makeNode('mnt/docs', 'folder', { parent: 'mnt' }),
        makeNode('mnt/keep.txt', 'file', { parent: 'mnt' }),
      ],
      {
        '/': 'root',
        '/mnt': 'mnt',
        '/mnt/docs': 'mnt/docs',
        '/mnt/keep.txt': 'mnt/keep.txt',
      },
    );
    const external = rewriteExternalNodes(
      {
        root: makeNode('root', 'folder', { children: ['docs', 'extra.txt'] }),
        docs: makeNode('docs', 'folder', {
          parent: 'root',
          children: ['docs/ext.txt'],
        }),
        'docs/ext.txt': makeNode('docs/ext.txt', 'file', { parent: 'docs' }),
        'extra.txt': makeNode('extra.txt', 'file', { parent: 'root' }),
      },
      'root',
      'mnt',
      mountSource,
      false,
    );

    const merged = mergeExternalNodes(localData, external, 'mnt');

    expect(merged.nodes['mnt'].children).toEqual([
      'mnt/docs',
      'mnt/keep.txt',
      'mnt/extra.txt',
    ]);
    expect(merged.nodes['mnt/keep.txt']).toBe(localData.nodes['mnt/keep.txt']);
    expect(merged.nodes['mnt/docs'].children).toEqual(['mnt/docs/ext.txt']);
  });
});

import { describe, expect, it } from 'vitest';

import {
  filterExternalChildren,
  filterExternalNodes,
  isExternalPathAllowed,
  matchesPathRule,
  rewriteExternalNodes,
} from '@/domain/external';
import type { ShareNode } from '@/domain/share-file';

import { githubSource, makeNode, makeShareFile } from './helpers';

const mountSource = githubSource();

/**
 * 外挂源内的目录树（ID 即源内相对路径）：
 * root → docs（a.txt / secret（hidden.txt））/ keep.txt
 */
function externalTree(): Record<string, ShareNode> {
  return {
    root: makeNode('root', 'folder', { children: ['docs', 'keep.txt'] }),
    docs: makeNode('docs', 'folder', {
      parent: 'root',
      children: ['docs/a.txt', 'docs/secret'],
    }),
    'docs/a.txt': makeNode('docs/a.txt', 'file', { parent: 'docs' }),
    'docs/secret': makeNode('docs/secret', 'folder', {
      parent: 'docs',
      children: ['docs/secret/hidden.txt'],
    }),
    'docs/secret/hidden.txt': makeNode('docs/secret/hidden.txt', 'file', {
      parent: 'docs/secret',
    }),
    'keep.txt': makeNode('keep.txt', 'file', { parent: 'root' }),
  };
}

describe('matchesPathRule', () => {
  it('命中规则自身', () => {
    expect(matchesPathRule('/a', ['/a'])).toBe(true);
  });

  it('命中规则下的子树', () => {
    expect(matchesPathRule('/a/b', ['/a'])).toBe(true);
    expect(matchesPathRule('/a/b/c.txt', ['/a'])).toBe(true);
  });

  it('前缀边界处不算命中：/a 不匹配 /ab', () => {
    expect(matchesPathRule('/ab', ['/a'])).toBe(false);
    expect(matchesPathRule('/ab/c', ['/a'])).toBe(false);
  });

  it('根规则 / 视为整个源，命中任意层级', () => {
    expect(matchesPathRule('/', ['/'])).toBe(true);
    expect(matchesPathRule('/a', ['/'])).toBe(true);
    expect(matchesPathRule('/a/b/c', ['/'])).toBe(true);
    expect(matchesPathRule('/', ['/a'])).toBe(false);
  });

  it('规则为空 / 缺失时不命中任何路径', () => {
    expect(matchesPathRule('/a', [])).toBe(false);
    expect(matchesPathRule('/a', undefined)).toBe(false);
  });

  it('多规则命中任意一条即可', () => {
    expect(matchesPathRule('/b/c', ['/a', '/b'])).toBe(true);
    expect(matchesPathRule('/c', ['/a', '/b'])).toBe(false);
  });

  it('宽松写法按构建期同款规则归一化：补前导斜杠、去尾斜杠', () => {
    expect(matchesPathRule('/docs/a.txt', ['docs'])).toBe(true);
    expect(matchesPathRule('/docs/a.txt', ['/docs/'])).toBe(true);
    expect(matchesPathRule('/docs/a.txt', ['  /docs  '])).toBe(true);
    expect(matchesPathRule('/docs/a.txt', ['   '])).toBe(false);
  });
});

describe('isExternalPathAllowed', () => {
  it('deny 优先于 allow', () => {
    expect(
      isExternalPathAllowed('/docs/secret', ['/docs'], ['/docs/secret']),
    ).toBe(false);
    expect(
      isExternalPathAllowed('/docs/a.txt', ['/docs'], ['/docs/secret']),
    ).toBe(true);
  });

  it('allow 非空时未命中的路径被排除', () => {
    expect(isExternalPathAllowed('/keep.txt', ['/docs'])).toBe(false);
    expect(isExternalPathAllowed('/docs/a.txt', ['/docs'])).toBe(true);
  });

  it('两字段皆空表示不限制', () => {
    expect(isExternalPathAllowed('/anything')).toBe(true);
    expect(isExternalPathAllowed('/anything', [], [])).toBe(true);
  });

  it('只配 deny 时其余路径放行', () => {
    expect(isExternalPathAllowed('/docs', undefined, ['/docs/secret'])).toBe(
      true,
    );
    expect(
      isExternalPathAllowed('/docs/secret', undefined, ['/docs/secret']),
    ).toBe(false);
  });

  it('deny / 拒绝整个源；allow / 放行整个源', () => {
    expect(isExternalPathAllowed('/', undefined, ['/'])).toBe(false);
    expect(isExternalPathAllowed('/a', undefined, ['/'])).toBe(false);
    expect(isExternalPathAllowed('/a/b', undefined, ['/'])).toBe(false);
    expect(isExternalPathAllowed('/a', ['/'])).toBe(true);
    expect(isExternalPathAllowed('/', ['/'])).toBe(true);
    expect(isExternalPathAllowed('/', ['/a'])).toBe(false);
  });
});

describe('filterExternalChildren', () => {
  it('deny 命中的节点连同整棵子树一起消失', () => {
    const filtered = filterExternalChildren(
      externalTree(),
      'root',
      ['/docs'],
      ['/docs/secret'],
    );

    expect(Object.keys(filtered)).toEqual(['root', 'docs', 'docs/a.txt']);
    expect(filtered.root.children).toEqual(['docs']);
    expect(filtered.docs.children).toEqual(['docs/a.txt']);
  });

  it('allow 未命中的节点连同整棵子树一起消失', () => {
    const filtered = filterExternalChildren(externalTree(), 'root', ['/docs']);

    // /docs 前缀下的节点全部保留（含 docs/secret），根下的 keep.txt 被剔除。
    expect(Object.keys(filtered)).toEqual([
      'root',
      'docs',
      'docs/a.txt',
      'docs/secret',
      'docs/secret/hidden.txt',
    ]);
    expect(filtered.root.children).toEqual(['docs']);
  });

  it('挂载根不参与判定，始终保留（deny / 时子树全被拒绝）', () => {
    const filtered = filterExternalChildren(externalTree(), 'root', [], ['/']);

    expect(Object.keys(filtered)).toEqual(['root']);
    expect(filtered.root.children).toEqual([]);
  });

  it('两字段皆空时原样返回', () => {
    const tree = externalTree();

    expect(filterExternalChildren(tree, 'root', [], [])).toBe(tree);
    expect(filterExternalChildren(tree, 'root')).toBe(tree);
  });

  it('sub_path 挂载时清单仍按外挂源坐标匹配（含 sub_path 前缀）', () => {
    const tree: Record<string, ShareNode> = {
      root: makeNode('root', 'folder', { children: ['softwares', 'other'] }),
      softwares: makeNode('softwares', 'folder', {
        parent: 'root',
        children: ['softwares/games', 'softwares/tools'],
      }),
      'softwares/games': makeNode('softwares/games', 'folder', {
        parent: 'softwares',
        children: ['softwares/games/a.rom'],
      }),
      'softwares/games/a.rom': makeNode('softwares/games/a.rom', 'file', {
        parent: 'softwares/games',
      }),
      'softwares/tools': makeNode('softwares/tools', 'folder', {
        parent: 'softwares',
      }),
      other: makeNode('other', 'folder', { parent: 'root' }),
    };
    // 挂载根是 softwares，但清单写的是外挂源坐标 /softwares/games。
    const filtered = filterExternalChildren(tree, 'softwares', [
      '/softwares/games',
    ]);

    expect(Object.keys(filtered)).toEqual([
      'softwares',
      'softwares/games',
      'softwares/games/a.rom',
    ]);
    expect(filtered.softwares.children).toEqual(['softwares/games']);
  });

  it('根节点缺失时原样返回，不抛错', () => {
    const tree = externalTree();

    expect(filterExternalChildren(tree, 'ghost', ['/docs'])).toBe(tree);
  });
});

describe('rewriteExternalNodes 的准入过滤', () => {
  it('被剔除的节点不进入重写结果与路径索引', () => {
    const result = rewriteExternalNodes(
      externalTree(),
      'root',
      'mnt',
      githubSource({ allow_paths: ['/docs'], deny_paths: ['/docs/secret'] }),
      false,
    );

    expect(Object.keys(result.nodes)).toEqual([
      'mnt',
      'mnt/docs',
      'mnt/docs/a.txt',
    ]);
    expect(result.nodes.mnt.children).toEqual(['mnt/docs']);
    expect(result.nodes['mnt/docs'].children).toEqual(['mnt/docs/a.txt']);
    expect(result.pathIndex).toEqual({
      '/mnt': 'mnt',
      '/mnt/docs': 'mnt/docs',
      '/mnt/docs/a.txt': 'mnt/docs/a.txt',
    });
  });

  it('挂载源没有配置清单时保持原有行为', () => {
    const result = rewriteExternalNodes(
      externalTree(),
      'root',
      'mnt',
      mountSource,
      false,
    );

    expect(Object.keys(result.nodes)).toEqual([
      'mnt',
      'mnt/docs',
      'mnt/docs/a.txt',
      'mnt/docs/secret',
      'mnt/docs/secret/hidden.txt',
      'mnt/keep.txt',
    ]);
  });

  it('sub_path 挂载时清单按外挂源坐标匹配，与构建期一致', () => {
    const data = makeShareFile(
      [
        makeNode('root', 'folder', { children: ['softwares'] }),
        makeNode('softwares', 'folder', {
          parent: 'root',
          children: ['softwares/games'],
        }),
        makeNode('softwares/games', 'folder', {
          parent: 'softwares',
          children: ['softwares/games/a.rom'],
        }),
        makeNode('softwares/games/a.rom', 'file', {
          parent: 'softwares/games',
        }),
      ],
      {
        '/': 'root',
        '/softwares': 'softwares',
        '/softwares/games': 'softwares/games',
        '/softwares/games/a.rom': 'softwares/games/a.rom',
      },
    );
    const filtered = filterExternalNodes(data, '/softwares');

    if (!filtered) throw new Error('expected the mounted subtree');

    const result = rewriteExternalNodes(
      filtered.nodes,
      filtered.rootNodeId,
      'mnt',
      githubSource({
        sub_path: '/softwares',
        allow_paths: ['/softwares/games'],
      }),
      false,
    );

    expect(Object.keys(result.nodes)).toEqual([
      'mnt',
      'mnt/games',
      'mnt/games/a.rom',
    ]);
    expect(result.pathIndex).toEqual({
      '/mnt': 'mnt',
      '/mnt/games': 'mnt/games',
      '/mnt/games/a.rom': 'mnt/games/a.rom',
    });
  });
});

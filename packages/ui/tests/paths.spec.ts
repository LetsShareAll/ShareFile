import { describe, expect, it } from 'vitest';

import {
  buildNodePathIndex,
  formatBrowserPath,
  getBreadcrumbSegments,
  getChildNodeIds,
  getNode,
  getNodePath,
  getNodePathFromId,
  isSafeRoutePath,
  normalizeRoutePath,
  sanitizeRoutePath,
} from '@/domain/paths';

import { makeNode, makeShareFile } from './helpers';

describe('normalizeRoutePath', () => {
  it('空串归一化为根路径', () => {
    expect(normalizeRoutePath('')).toBe('/');
  });

  it('缺少前导斜杠时补齐', () => {
    expect(normalizeRoutePath('docs/a.txt')).toBe('/docs/a.txt');
  });

  it('去掉尾部斜杠', () => {
    expect(normalizeRoutePath('/docs/')).toBe('/docs');
    expect(normalizeRoutePath('/docs///')).toBe('/docs');
  });

  it('只有斜杠时返回根路径', () => {
    expect(normalizeRoutePath('/')).toBe('/');
    expect(normalizeRoutePath('///')).toBe('/');
  });

  it('保留中间重复的斜杠', () => {
    expect(normalizeRoutePath('/docs//a.txt')).toBe('/docs//a.txt');
  });
});

describe('isSafeRoutePath', () => {
  it('拒绝协议相对地址', () => {
    expect(isSafeRoutePath('//host/path')).toBe(false);
  });

  it('拒绝带协议的绝对地址', () => {
    expect(isSafeRoutePath('https://example.com/x')).toBe(false);
    expect(isSafeRoutePath('mailto:a@b.c')).toBe(false);
  });

  it('拒绝 .. 与 . 段', () => {
    expect(isSafeRoutePath('/..')).toBe(false);
    expect(isSafeRoutePath('/a/../b')).toBe(false);
    expect(isSafeRoutePath('/.')).toBe(false);
    expect(isSafeRoutePath('/a/./b')).toBe(false);
  });

  it('拒绝含冒号的段', () => {
    expect(isSafeRoutePath('/a:b')).toBe(false);
    expect(isSafeRoutePath('a:b')).toBe(false);
  });

  it('接受普通路径与空串', () => {
    expect(isSafeRoutePath('/docs/a.txt')).toBe(true);
    expect(isSafeRoutePath('docs')).toBe(true);
    expect(isSafeRoutePath('')).toBe(true);
  });
});

describe('sanitizeRoutePath', () => {
  it('非法输入退回根路径', () => {
    expect(sanitizeRoutePath('//host')).toBe('/');
    expect(sanitizeRoutePath('https://x')).toBe('/');
    expect(sanitizeRoutePath('..')).toBe('/');
    expect(sanitizeRoutePath('/a/./b')).toBe('/');
  });

  it('合法路径返回归一化结果', () => {
    expect(sanitizeRoutePath('docs/')).toBe('/docs');
    expect(sanitizeRoutePath('/docs//')).toBe('/docs');
  });
});

describe('formatBrowserPath', () => {
  it('根路径保持 /', () => {
    expect(formatBrowserPath('/')).toBe('/');
    expect(formatBrowserPath('')).toBe('/');
  });

  it('中文与空格做 encodeURI', () => {
    expect(formatBrowserPath('/中文 目录/a.txt')).toBe(
      '/%E4%B8%AD%E6%96%87%20%E7%9B%AE%E5%BD%95/a.txt',
    );
  });

  it('ASCII 路径原样返回', () => {
    expect(formatBrowserPath('docs/a.txt/')).toBe('/docs/a.txt');
  });
});

describe('getNodePathFromId', () => {
  it("root 固定为 '/'", () => {
    expect(getNodePathFromId('root')).toBe('/');
  });

  it('普通 ID 补前导斜杠', () => {
    expect(getNodePathFromId('docs/a.txt')).toBe('/docs/a.txt');
  });

  it('合并重复斜杠', () => {
    expect(getNodePathFromId('docs//a.txt')).toBe('/docs/a.txt');
  });
});

describe('buildNodePathIndex 与 getNodePath', () => {
  const shareFile = makeShareFile(
    [makeNode('root', 'folder'), makeNode('docs/a.txt', 'file')],
    { '/': 'root', '/docs/a.txt': 'docs/a.txt' },
  );
  const nodePathIndex = buildNodePathIndex(shareFile);

  it('用 path_index 反查节点路径', () => {
    expect(getNodePath(nodePathIndex, 'docs/a.txt')).toBe('/docs/a.txt');
  });

  it('索引缺失时按 ID 规则回退', () => {
    expect(getNodePath(nodePathIndex, 'ghost.txt')).toBe('/ghost.txt');
  });

  it('索引为空时 root 回退为 /', () => {
    expect(getNodePath(new Map<string, string>(), 'root')).toBe('/');
  });
});

describe('getBreadcrumbSegments', () => {
  it('根路径没有分段', () => {
    expect(getBreadcrumbSegments('/')).toEqual([]);
  });

  it('按段累积 path 并标记当前段', () => {
    expect(getBreadcrumbSegments('/docs/a/b.txt')).toEqual([
      { label: 'docs', path: '/docs', isCurrent: false },
      { label: 'a', path: '/docs/a', isCurrent: false },
      { label: 'b.txt', path: '/docs/a/b.txt', isCurrent: true },
    ]);
  });

  it('忽略首尾斜杠与空白段', () => {
    expect(getBreadcrumbSegments('docs//')).toEqual([
      { label: 'docs', path: '/docs', isCurrent: true },
    ]);
  });
});

describe('getChildNodeIds 与 getNode', () => {
  const shareFile = makeShareFile([
    makeNode('root', 'folder', { children: ['docs'] }),
    makeNode('docs', 'folder', { parent: 'root', children: ['docs/a.txt'] }),
    makeNode('docs/a.txt', 'file', { parent: 'docs' }),
  ]);

  it('返回子节点 ID 的副本', () => {
    const children = getChildNodeIds(shareFile, 'docs');

    expect(children).toEqual(['docs/a.txt']);

    children.push('mutated');

    expect(getChildNodeIds(shareFile, 'docs')).toEqual(['docs/a.txt']);
  });

  it('节点缺失时返回空数组', () => {
    expect(getChildNodeIds(shareFile, 'ghost')).toEqual([]);
  });

  it('getNode 命中时返回节点本身', () => {
    expect(getNode(shareFile, 'docs/a.txt')).toBe(
      shareFile.nodes['docs/a.txt'],
    );
  });

  it('getNode 未命中时返回 undefined', () => {
    expect(getNode(shareFile, 'ghost')).toBeUndefined();
  });
});

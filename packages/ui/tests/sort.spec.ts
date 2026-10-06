import { describe, expect, it } from 'vitest';

import {
  formatSortPreference,
  getDefaultSortDirection,
  parseSortPreference,
  sortNodes,
} from '@/domain/sort';
import type { ShareNode } from '@/domain/share-file';

import { makeNode } from './helpers';

const context = {
  getPath: (nodeId: string) => `/${nodeId}`,
  getTypeClass: (node: ShareNode) => {
    if (node.type === 'folder') return 'folder';
    if (node.name.endsWith('.png')) return 'image';
    if (node.name.endsWith('.mp4')) return 'video';

    return 'unknown';
  },
};

function node(
  id: string,
  type: ShareNode['type'],
  extra: Partial<ShareNode> = {},
): ShareNode {
  return makeNode(id, type, { name: id.split('/').pop() ?? id, ...extra });
}

describe('默认方向', () => {
  it('名称与类型升序，大小与时间降序', () => {
    expect(getDefaultSortDirection('name')).toBe('asc');
    expect(getDefaultSortDirection('type')).toBe('asc');
    expect(getDefaultSortDirection('size')).toBe('desc');
    expect(getDefaultSortDirection('updated')).toBe('desc');
    expect(getDefaultSortDirection('created')).toBe('desc');
  });
});

describe('文件夹优先', () => {
  const nodes = [
    node('a.png', 'file', { size: 100 }),
    node('b-dir', 'folder'),
    node('c.mp4', 'file', { size: 50 }),
  ];

  it.each(['type', 'name', 'size'] as const)(
    '%s 排序下文件夹仍排在最前',
    key => {
      const sorted = sortNodes(nodes, key, 'asc', context);

      expect(sorted[0].id).toBe('b-dir');
    },
  );
});

describe('名称排序', () => {
  it('按 zh-CN 升序与降序', () => {
    const nodes = [
      node('b.txt', 'file'),
      node('a.txt', 'file'),
      node('c.txt', 'file'),
    ];

    expect(sortNodes(nodes, 'name', 'asc', context).map(n => n.id)).toEqual([
      'a.txt',
      'b.txt',
      'c.txt',
    ]);
    expect(sortNodes(nodes, 'name', 'desc', context).map(n => n.id)).toEqual([
      'c.txt',
      'b.txt',
      'a.txt',
    ]);
  });
});

describe('大小排序', () => {
  const nodes = [
    node('small.bin', 'file', { size: 10 }),
    node('big.bin', 'file', { size: 1000 }),
    node('unknown.bin', 'file', {}),
  ];

  it('降序时最大在前，未知大小永远在最后', () => {
    expect(sortNodes(nodes, 'size', 'desc', context).map(n => n.id)).toEqual([
      'big.bin',
      'small.bin',
      'unknown.bin',
    ]);
  });

  it('升序时最小在前，未知大小仍在最后', () => {
    expect(sortNodes(nodes, 'size', 'asc', context).map(n => n.id)).toEqual([
      'small.bin',
      'big.bin',
      'unknown.bin',
    ]);
  });
});

describe('时间排序', () => {
  const nodes = [
    node('old.txt', 'file', {
      updated_at: '2026-01-01T00:00:00.000Z',
      created_at: '2025-12-01T00:00:00.000Z',
    }),
    node('new.txt', 'file', {
      updated_at: '2026-06-01T00:00:00.000Z',
      created_at: '2026-05-01T00:00:00.000Z',
    }),
    node('none.txt', 'file', {}),
  ];

  it('更新时间降序：最新在前，缺失在最后', () => {
    expect(sortNodes(nodes, 'updated', 'desc', context).map(n => n.id)).toEqual(
      ['new.txt', 'old.txt', 'none.txt'],
    );
  });

  it('创建时间升序：最早在前，缺失在最后', () => {
    expect(sortNodes(nodes, 'created', 'asc', context).map(n => n.id)).toEqual([
      'old.txt',
      'new.txt',
      'none.txt',
    ]);
  });
});

describe('类型排序', () => {
  it('按展示类型分组（image / unknown / video）', () => {
    const nodes = [
      node('b.mp4', 'file'),
      node('a.png', 'file'),
      node('c.txt', 'file'),
    ];

    expect(sortNodes(nodes, 'type', 'asc', context).map(n => n.id)).toEqual([
      'a.png',
      'c.txt',
      'b.mp4',
    ]);
  });
});

describe('默认顺序', () => {
  const nodes = [node('a', 'folder'), node('b', 'file'), node('c', 'folder')];

  it('保持索引顺序，降序为反转', () => {
    expect(sortNodes(nodes, 'default', 'asc', context).map(n => n.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(sortNodes(nodes, 'default', 'desc', context).map(n => n.id)).toEqual(
      ['c', 'b', 'a'],
    );
  });
});

describe('同值兜底', () => {
  it('同大小按 zh-CN 路径稳定排序', () => {
    const nodes = [
      node('b.bin', 'file', { size: 5 }),
      node('a.bin', 'file', { size: 5 }),
    ];

    expect(sortNodes(nodes, 'size', 'desc', context).map(n => n.id)).toEqual([
      'a.bin',
      'b.bin',
    ]);
  });
});

describe('偏好解析', () => {
  it('解析合法值', () => {
    expect(parseSortPreference('size:asc')).toEqual({
      key: 'size',
      direction: 'asc',
    });
  });

  it('非法值回落到默认顺序', () => {
    expect(parseSortPreference(null)).toEqual({
      key: 'default',
      direction: 'asc',
    });
    expect(parseSortPreference('nope:asc')).toEqual({
      key: 'default',
      direction: 'asc',
    });
    expect(parseSortPreference('size:sideways')).toEqual({
      key: 'default',
      direction: 'asc',
    });
  });

  it('格式化与解析互逆', () => {
    const preference = { key: 'created', direction: 'desc' } as const;

    expect(parseSortPreference(formatSortPreference(preference))).toEqual(
      preference,
    );
  });
});

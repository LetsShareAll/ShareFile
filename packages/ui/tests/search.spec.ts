import { describe, expect, it } from 'vitest';

import { buildNodePathIndex } from '@/domain/paths';
import { searchNodes } from '@/domain/search';

import { makeNode, makeShareFile } from './helpers';

const shareFile = makeShareFile(
  [
    makeNode('root', 'folder', {
      name: '根目录',
      children: ['archive', 'docs'],
    }),
    makeNode('archive', 'folder', { name: '归档文件', parent: 'root' }),
    makeNode('docs', 'folder', {
      name: '文档',
      parent: 'root',
      children: ['docs/a.md'],
    }),
    makeNode('docs/a.md', 'file', { name: '文件甲.md', parent: 'docs' }),
    makeNode('李.md', 'file', {
      name: '文件李.md',
      parent: 'root',
      description: '说明文本',
    }),
    makeNode('张.md', 'file', { name: '文件张.md', parent: 'root' }),
    makeNode('secret.txt', 'file', {
      name: '隐藏节点.txt',
      parent: 'root',
      hidden: true,
    }),
    makeNode('other.txt', 'file', { name: 'other.txt', parent: 'root' }),
  ],
  {
    '/': 'root',
    '/archive': 'archive',
    '/docs': 'docs',
    '/docs/a.md': 'docs/a.md',
    '/李.md': '李.md',
    '/张.md': '张.md',
    '/secret.txt': 'secret.txt',
    '/other.txt': 'other.txt',
  },
);

const nodePathIndex = buildNodePathIndex(shareFile);

function search(query: string): string[] {
  return searchNodes(shareFile, nodePathIndex, query);
}

describe('searchNodes 查询归一化', () => {
  it('空查询与纯空白查询返回空数组', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });

  it('去除首尾空白并忽略大小写', () => {
    expect(search('  A.MD  ')).toEqual(['docs/a.md']);
  });
});

describe('searchNodes 匹配范围', () => {
  it('根节点永不入选', () => {
    expect(search('根目录')).toEqual([]);
  });

  it('名称命中', () => {
    expect(search('文件张')).toEqual(['张.md']);
  });

  it('描述命中', () => {
    expect(search('说明文本')).toEqual(['李.md']);
  });

  it('路径命中', () => {
    expect(search('/docs/a')).toEqual(['docs/a.md']);
  });
});

describe('searchNodes 排序', () => {
  it('文件夹排在前，其余按 zh-CN 路径排序', () => {
    expect(search('文件')).toEqual(['archive', '李.md', '张.md', 'docs/a.md']);
  });
});

describe('searchNodes 对 hidden 节点的现状契约', () => {
  it('当前不会排除 hidden: true 的节点', () => {
    expect(search('隐藏节点')).toEqual(['secret.txt']);
  });
});

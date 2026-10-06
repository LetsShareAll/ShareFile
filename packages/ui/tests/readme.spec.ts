import { describe, expect, it } from 'vitest';

import { findDirectoryReadme, getReadmeUrl } from '@/domain/readme';

import { makeNode, makeShareFile } from './helpers';

describe('findDirectoryReadme', () => {
  it('在目录直接子节点里找到 README.md', () => {
    const data = makeShareFile(
      [
        makeNode('root', 'folder', { children: ['docs'] }),
        makeNode('docs', 'folder', {
          parent: 'root',
          children: ['docs/README.md'],
        }),
        makeNode('docs/README.md', 'file', {
          parent: 'docs',
          name: 'README.md',
        }),
      ],
      { '/': 'root', '/docs': 'docs' },
    );

    expect(findDirectoryReadme(data, '/docs')?.id).toBe('docs/README.md');
  });

  it('当前路径不是目录时返回 undefined', () => {
    const data = makeShareFile([makeNode('a.txt', 'file', { name: 'a.txt' })], {
      '/a.txt': 'a.txt',
    });

    expect(findDirectoryReadme(data, '/a.txt')).toBeUndefined();
  });

  it('没有 README.md 子节点时返回 undefined', () => {
    const data = makeShareFile([makeNode('root', 'folder', { children: [] })], {
      '/': 'root',
    });

    expect(findDirectoryReadme(data, '/')).toBeUndefined();
  });

  it('路径不存在时返回 undefined', () => {
    const data = makeShareFile([makeNode('root', 'folder')], { '/': 'root' });

    expect(findDirectoryReadme(data, '/nope')).toBeUndefined();
  });

  it('索引为 null 时返回 undefined', () => {
    expect(findDirectoryReadme(null, '/')).toBeUndefined();
  });
});

describe('getReadmeUrl', () => {
  it('优先使用节点直链', () => {
    const node = makeNode('docs/README.md', 'file', {
      name: 'README.md',
      url: 'https://cdn.example.com/docs/README.md',
    });

    expect(getReadmeUrl(node, '/docs')).toBe(
      'https://cdn.example.com/docs/README.md',
    );
  });

  it('没有直链时回退到同源目录路径', () => {
    const node = makeNode('docs/README.md', 'file', { name: 'README.md' });

    expect(getReadmeUrl(node, '/docs')).toBe('/docs/README.md');
  });

  it('根目录回退到 /README.md', () => {
    const node = makeNode('README.md', 'file', { name: 'README.md' });

    expect(getReadmeUrl(node, '/')).toBe('/README.md');
  });
});

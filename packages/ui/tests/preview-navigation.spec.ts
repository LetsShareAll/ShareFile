import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ShareFile, ShareNode } from '@/domain/share-file';
import {
  findNodeIndex,
  getAdjacentNode,
  sortNavigationNodes,
} from '@/features/preview/navigation';
import { useLibraryStore } from '@/stores/library';
import { usePreviewStore } from '@/stores/preview';
import { useUiStore } from '@/stores/ui';
import { makeNode, makeShareFile } from './helpers';

const A = 'docs/a.md';
const B = 'docs/b.md';
const C = 'docs/c.md';

/** 同一目录下三个文件：体积 a > c > b，用于验证导航顺序与 size 降序一致。 */
function makeIndex(): ShareFile {
  const root = makeNode('root', 'folder', { children: ['docs'] });
  const docs = makeNode('docs', 'folder', {
    parent: 'root',
    children: [A, B, C],
  });

  return makeShareFile(
    [
      root,
      docs,
      makeNode(A, 'file', { parent: 'docs', size: 300 }),
      makeNode(B, 'file', { parent: 'docs', size: 100 }),
      makeNode(C, 'file', { parent: 'docs', size: 200 }),
    ],
    {
      '/': 'root',
      '/docs': 'docs',
      [A]: A,
      [B]: B,
      [C]: C,
    },
  );
}

function getNode(shareFile: ShareFile, id: string): ShareNode {
  const node = shareFile.nodes[id];

  if (!node) throw new Error(`missing node ${id}`);

  return node;
}

describe('相邻节点计算', () => {
  const nodes = [makeNode(A, 'file'), makeNode(B, 'file'), makeNode(C, 'file')];

  it('返回上一个 / 下一个节点', () => {
    expect(getAdjacentNode(nodes, B, -1)?.id).toBe(A);
    expect(getAdjacentNode(nodes, B, 1)?.id).toBe(C);
  });

  it('边界停住，不循环', () => {
    expect(getAdjacentNode(nodes, A, -1)).toBeNull();
    expect(getAdjacentNode(nodes, C, 1)).toBeNull();
  });

  it('不在列表里的节点不猜邻居', () => {
    expect(findNodeIndex(nodes, 'other.md')).toBe(-1);
    expect(findNodeIndex(nodes, null)).toBe(-1);
    expect(getAdjacentNode(nodes, 'other.md', 1)).toBeNull();
    expect(getAdjacentNode(nodes, null, -1)).toBeNull();
  });
});

describe('预览导航列表', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.history.pushState({}, '', '/docs');
  });

  function setup() {
    const library = useLibraryStore();
    const shareFile = makeIndex();

    library.merged = shareFile;

    const ui = useUiStore();
    const preview = usePreviewStore();

    return { library, shareFile, ui, preview };
  }

  it('与 BrowseView 同源同序（size 降序）', () => {
    const { library, ui, preview } = setup();

    ui.setSortKey('size');

    const expected = sortNavigationNodes(library.getChildNodes('/docs'), {
      key: ui.sortKey,
      direction: ui.sortDirection,
      getPath: nodeId => library.getNodePathById(nodeId),
    });

    expect(ui.sortDirection).toBe('desc');
    expect(preview.navigation.map(node => node.id)).toEqual(
      expected.map(node => node.id),
    );
    expect(preview.navigation.map(node => node.id)).toEqual([A, C, B]);
  });

  it('goPrev / goNext 按列表顺序切换，边界停住', async () => {
    const { library, shareFile, ui, preview } = setup();

    ui.setSortKey('size');
    await preview.openFile(getNode(shareFile, B));

    expect(preview.canGoNext).toBe(false);
    expect(preview.canGoPrev).toBe(true);

    preview.goPrev();
    expect(preview.node?.id).toBe(C);

    preview.goPrev();
    expect(preview.node?.id).toBe(A);
    expect(preview.canGoPrev).toBe(false);

    preview.goPrev();
    expect(preview.node?.id).toBe(A);

    preview.goNext();
    expect(preview.node?.id).toBe(C);
    expect(library.getChildNodes('/docs')).toHaveLength(3);
  });

  it('搜索态用搜索结果集作为导航列表', async () => {
    const { shareFile, ui, preview } = setup();

    ui.setQuery('c.md');
    await preview.openFile(getNode(shareFile, C));

    expect(preview.navigation.map(node => node.id)).toEqual([C]);
    expect(preview.canGoPrev).toBe(false);
    expect(preview.canGoNext).toBe(false);
  });

  it('深链目标不在索引里时给出错误态而不是空弹窗', () => {
    const { preview } = setup();

    window.history.pushState({}, '', '/docs?preview=%2Fdocs%2Fmissing.md');
    preview.openFromLocation();

    expect(preview.isOpen).toBe(true);
    expect(preview.error).toBe('预览目标不存在或已被移除');
    expect(preview.node).toBeNull();
    expect(preview.title).toBe('missing.md');
  });
});

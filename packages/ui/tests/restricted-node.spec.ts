import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { RESTRICTED_NOTICE, isRestrictedNode } from '@/domain/share-file';
import MusicPanel from '@/features/music/MusicPanel.vue';
import { useMusicStore } from '@/stores/music';
import type { ShareFile, ShareNode } from '@/domain/share-file';
import FileListDetail from '@/features/browse/components/FileListDetail.vue';
import FileListIcon from '@/features/browse/components/FileListIcon.vue';
import NodeActions from '@/features/browse/components/NodeActions.vue';
import PreviewFooter from '@/features/preview/PreviewFooter.vue';
import BrowseView from '@/features/browse/BrowseView.vue';
import { createNodeRow } from '@/features/browse/nodeDisplay';
import { useLibraryStore } from '@/stores/library';

import { makeNode, makeShareFile } from './helpers';

const RESTRICTED_FRAGMENT = '无法阻止直接访问';

function makeRestrictedFile(): ShareNode {
  return makeNode('locked.txt', 'file', {
    name: 'locked.txt',
    restricted: true,
    size: 1024,
  });
}

function makeOpenFile(): ShareNode {
  return makeNode('open.txt', 'file', { name: 'open.txt', size: 2048 });
}

function makeRows(nodes: ShareNode[], pathPrefix = '/') {
  return nodes.map(node => createNodeRow(node, `${pathPrefix}${node.name}`));
}

describe('isRestrictedNode', () => {
  it('缺失与 false 视为未限制，只有严格 true 才是受限', () => {
    expect(isRestrictedNode(makeNode('a.txt', 'file'))).toBe(false);
    expect(
      isRestrictedNode(makeNode('a.txt', 'file', { restricted: false })),
    ).toBe(false);
    expect(
      isRestrictedNode(makeNode('a.txt', 'file', { restricted: true })),
    ).toBe(true);
    expect(isRestrictedNode(undefined)).toBe(false);
  });
});

describe.each([
  ['FileListDetail', FileListDetail],
  ['FileListIcon', FileListIcon],
])('%s 的受限标识与分享动作', (_name, component) => {
  it('受限文件带「受限」标识，三个复制按钮禁用并给出诚实提示', () => {
    const wrapper = mount(component, {
      props: { rows: makeRows([makeRestrictedFile(), makeOpenFile()]) },
    });
    const restrictedItem = wrapper.findAll('.file-item')[0];
    const indicator = restrictedItem.get('.restricted-indicator');

    expect(indicator.text()).toContain('受限');
    expect(indicator.attributes('title')).toContain(RESTRICTED_FRAGMENT);
    expect(indicator.attributes('aria-label')).toContain(RESTRICTED_FRAGMENT);

    const buttons = restrictedItem.findAll('button.action-btn');
    const disabledButtons = restrictedItem.findAll(
      'button.action-btn[disabled]',
    );

    // 页面链接 / 直链 / curl 三个分享动作禁用；下载不在分享入口之列，保持可用。
    expect(buttons).toHaveLength(4);
    expect(disabledButtons).toHaveLength(3);
    disabledButtons.forEach(button => {
      expect(button.attributes('title')).toContain(RESTRICTED_FRAGMENT);
    });
    expect(buttons[3].attributes('title')).toContain('下载文件');
  });

  it('未受限（缺失 / false）的邻居既无标识也未被禁用', () => {
    const wrapper = mount(component, {
      props: {
        rows: makeRows([
          makeOpenFile(),
          makeNode('plain.txt', 'file', {
            name: 'plain.txt',
            restricted: false,
          }),
        ]),
      },
    });

    expect(wrapper.find('.restricted-indicator').exists()).toBe(false);
    expect(wrapper.findAll('button.action-btn[disabled]')).toHaveLength(0);
    expect(wrapper.findAll('button.action-btn')[1].attributes('title')).toBe(
      '复制直链',
    );
  });

  it('搜索结果行（showPath）同样带标识', () => {
    const wrapper = mount(component, {
      props: {
        rows: makeRows([makeRestrictedFile()], '/search/'),
        showPath: true,
      },
    });

    expect(wrapper.get('.item-path').text()).toBe('/search/locked.txt');
    expect(wrapper.get('.restricted-indicator').attributes('title')).toContain(
      RESTRICTED_FRAGMENT,
    );
  });
});

describe('NodeActions 的分享动作禁用', () => {
  it('受限节点禁用三个复制按钮并替换 title', () => {
    const wrapper = mount(NodeActions, {
      props: {
        node: makeRestrictedFile(),
        pageUrl: 'https://example.com/locked.txt',
        fileUrl: 'https://example.com/files/locked.txt',
      },
    });
    const disabledButtons = wrapper.findAll('button.action-btn[disabled]');

    expect(disabledButtons).toHaveLength(3);
    disabledButtons.forEach(button => {
      expect(button.attributes('title')).toBe(RESTRICTED_NOTICE);
    });
  });

  it('未受限节点保留原有 title', () => {
    const wrapper = mount(NodeActions, {
      props: {
        node: makeOpenFile(),
        pageUrl: 'https://example.com/open.txt',
        fileUrl: 'https://example.com/files/open.txt',
      },
    });

    expect(wrapper.findAll('button.action-btn[disabled]')).toHaveLength(0);
    expect(
      wrapper
        .findAll('button.action-btn')
        .map(button => button.attributes('title')),
    ).toEqual(['复制页面链接', '复制直链', '复制 curl 命令', '下载文件 (KB)']);
  });
});

describe('PreviewFooter 的分享动作禁用', () => {
  function mountFooter(node: ShareNode) {
    return mount(PreviewFooter, {
      props: {
        node,
        fileUrl: 'https://example.com/files/a.txt',
        pageUrl: 'https://example.com/a.txt',
      },
    });
  }

  it('受限节点的三个复制动作禁用，预览本身不受影响', () => {
    const wrapper = mountFooter(makeRestrictedFile());
    const buttons = wrapper.findAll('.preview-footer-actions button');

    expect(buttons).toHaveLength(4);
    buttons.slice(0, 3).forEach(button => {
      expect(button.attributes('disabled')).toBeDefined();
      expect(button.attributes('title')).toBe(RESTRICTED_NOTICE);
    });
    expect(buttons[3].attributes('disabled')).toBeUndefined();
    expect(buttons[3].attributes('title')).toBe('新标签打开');
  });

  it('未受限节点保留原有 title', () => {
    const wrapper = mountFooter(makeOpenFile());
    const buttons = wrapper.findAll('.preview-footer-actions button');

    expect(
      buttons.slice(0, 3).map(button => button.attributes('title')),
    ).toEqual(['复制直链', '复制页面链接', '复制 curl 命令']);
    expect(
      wrapper.findAll('.preview-footer-actions button[disabled]'),
    ).toHaveLength(0);
  });
});

describe('BrowseView 的目录分享入口', () => {
  function makeBrowseData(): ShareFile {
    return makeShareFile(
      [
        makeNode('root', 'folder', { children: ['locked', 'open'] }),
        makeNode('locked', 'folder', { parent: 'root', restricted: true }),
        makeNode('open', 'folder', { parent: 'root' }),
      ],
      { '/': 'root', '/locked': 'locked', '/open': 'open' },
    );
  }

  async function mountBrowse(path: string) {
    const pinia = createPinia();

    setActivePinia(pinia);

    const library = useLibraryStore(pinia);
    const data = makeBrowseData();

    library.base = data;
    library.merged = data;

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
      ],
    });

    await router.push(path);
    await router.isReady();

    return mount(BrowseView, { global: { plugins: [pinia, router] } });
  }

  it('当前目录受限时分享按钮禁用并提示', async () => {
    const wrapper = await mountBrowse('/locked');
    const shareButton = wrapper.get('.share-btn');

    expect(shareButton.attributes('disabled')).toBeDefined();
    expect(shareButton.attributes('title')).toBe(RESTRICTED_NOTICE);
  });

  it('未受限目录的分享按钮保持可用', async () => {
    const wrapper = await mountBrowse('/open');
    const shareButton = wrapper.get('.share-btn');

    expect(shareButton.attributes('disabled')).toBeUndefined();
    expect(shareButton.attributes('title')).toBe('分享当前目录');
  });
});

describe('受限曲目在音乐播放器面板', () => {
  it('三个分享动作禁用并带诚实提示，播放本身不受影响', () => {
    const pinia = createPinia();

    setActivePinia(pinia);

    const music = useMusicStore();

    music.queue = [
      {
        id: 'a.mp3',
        name: 'a.mp3',
        path: '/music/a.mp3',
        url: 'https://cdn.example.com/a.mp3',
        restricted: true,
      },
    ];
    music.currentIndex = 0;
    music.expanded = true;

    const wrapper = mount(MusicPanel, {
      global: { plugins: [pinia] },
    });
    const buttons = wrapper.findAll('.music-panel-share-btn');

    expect(buttons).toHaveLength(3);
    buttons.forEach(button => {
      expect(button.attributes('disabled')).toBeDefined();
      expect(button.attributes('title')).toContain('无法阻止直接访问');
    });
    // 播放/暂停仍然可用：受限只挡分享入口，不挡使用。
    expect(
      wrapper.find('.music-panel-btn[aria-label="暂停"]').exists() ||
        wrapper.find('.music-panel-btn[aria-label="播放"]').exists(),
    ).toBe(true);
  });
});

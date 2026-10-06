import { describe, expect, it, vi } from 'vitest';

import { prefetchPreviewChunk } from '@/features/preview/prefetch';
import type {
  NodePlugin,
  NodePluginMatchInput,
  NodePluginPreviewResult,
  NodePluginRegistry,
} from '@/domain/plugins';
import type { ShareNode } from '@/domain/share-file';

import { makeNode } from './helpers';

function makeRegistry(preview: () => Promise<NodePluginPreviewResult>): {
  registry: NodePluginRegistry;
  resolve: ReturnType<typeof vi.fn>;
} {
  const plugin: NodePlugin = {
    id: 'code',
    match: () => true,
    getInfo: () => ({ iconClass: 'fas fa-file-code', className: 'code' }),
    preview: () => preview(),
  };
  const resolve = vi.fn((input: NodePluginMatchInput) => ({
    plugin,
    info: plugin.getInfo(input),
    input,
  }));

  return {
    registry: {
      resolve: resolve as unknown as NodePluginRegistry['resolve'],
      register: vi.fn(),
      list: () => [],
    },
    resolve,
  };
}

describe('prefetchPreviewChunk', () => {
  it('对文件节点触发一次插件 chunk 预取', () => {
    const preview = vi.fn(
      (): Promise<NodePluginPreviewResult> => Promise.resolve(false),
    );
    const { registry } = makeRegistry(preview);
    const node: ShareNode = makeNode('main.ts', 'file', { name: 'main.ts' });

    prefetchPreviewChunk(node, registry);

    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('同一插件的 chunk 只预取一次', () => {
    const preview = vi.fn(
      (): Promise<NodePluginPreviewResult> => Promise.resolve(false),
    );
    const { registry } = makeRegistry(preview);
    const loaded = new Set<string>();

    prefetchPreviewChunk(makeNode('a.ts', 'file'), registry, loaded);
    prefetchPreviewChunk(makeNode('b.ts', 'file'), registry, loaded);

    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('文件夹与空值不触发', () => {
    const preview = vi.fn(
      (): Promise<NodePluginPreviewResult> => Promise.resolve(false),
    );
    const { registry } = makeRegistry(preview);

    prefetchPreviewChunk(makeNode('docs', 'folder'), registry);
    prefetchPreviewChunk(null, registry);

    expect(preview).not.toHaveBeenCalled();
  });

  it('没有 preview 的插件不触发', () => {
    const resolve = vi.fn(() => ({
      plugin: {
        id: 'folder',
        match: () => true,
        getInfo: () => ({ iconClass: 'fas fa-folder', className: 'folder' }),
      },
      info: { iconClass: 'fas fa-folder', className: 'folder' },
      input: { name: 'docs', nodeType: 'folder' as const },
    }));
    const registry: NodePluginRegistry = {
      resolve,
      register: vi.fn(),
      list: () => [],
    };

    expect(() =>
      prefetchPreviewChunk(makeNode('docs', 'folder'), registry),
    ).not.toThrow();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('加载失败或解析异常都不向外抛', () => {
    const failing = vi.fn(
      (): Promise<NodePluginPreviewResult> =>
        Promise.reject(new Error('chunk 加载失败')),
    );
    const { registry } = makeRegistry(failing);
    const throwing: NodePluginRegistry = {
      resolve: () => {
        throw new Error('无匹配插件');
      },
      register: vi.fn(),
      list: () => [],
    };

    expect(() =>
      prefetchPreviewChunk(makeNode('a.ts', 'file'), registry),
    ).not.toThrow();
    expect(() =>
      prefetchPreviewChunk(makeNode('a.ts', 'file'), throwing),
    ).not.toThrow();
  });
});

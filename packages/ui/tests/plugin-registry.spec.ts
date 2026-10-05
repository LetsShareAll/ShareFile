import { describe, expect, it } from 'vitest';

import {
  compareRegisteredPlugins,
  createNodePlugin,
  createNodePluginRegistry,
} from '@/domain/plugins';
import type {
  NodePlugin,
  NodePluginMatchInput,
  NodeTypeInfo,
} from '@/domain/plugins';

const TEXT_INFO: NodeTypeInfo = { iconClass: 'icon-text', className: 'text' };

function makePlugin(
  id: string,
  options: { priority?: number } = {},
): NodePlugin {
  return {
    id,
    priority: options.priority,
    match: () => true,
    getInfo: () => ({ ...TEXT_INFO }),
  };
}

function registered(plugin: NodePlugin, registrationOrder: number) {
  return { plugin, registrationOrder };
}

describe('compareRegisteredPlugins', () => {
  it('优先级降序：高优先级排在前', () => {
    const high = registered(makePlugin('high', { priority: 10 }), 0);
    const low = registered(makePlugin('low', { priority: 5 }), 1);

    expect(compareRegisteredPlugins(high, low)).toBeLessThan(0);
    expect(compareRegisteredPlugins(low, high)).toBeGreaterThan(0);
  });

  it('未声明 priority 视为 0', () => {
    const explicit = registered(makePlugin('explicit', { priority: 1 }), 1);
    const implicit = registered(makePlugin('implicit'), 0);

    expect(compareRegisteredPlugins(implicit, explicit)).toBeGreaterThan(0);
    expect(compareRegisteredPlugins(explicit, implicit)).toBeLessThan(0);
  });

  it('同优先级时后注册者优先', () => {
    const first = registered(makePlugin('first', { priority: 3 }), 0);
    const second = registered(makePlugin('second', { priority: 3 }), 1);

    expect(compareRegisteredPlugins(second, first)).toBeLessThan(0);
    expect(compareRegisteredPlugins(first, second)).toBeGreaterThan(0);
  });

  it('同一项比较结果为 0', () => {
    const entry = registered(makePlugin('same', { priority: 3 }), 7);

    expect(compareRegisteredPlugins(entry, entry)).toBe(0);
  });
});

describe('createNodePluginRegistry', () => {
  const input: NodePluginMatchInput = { name: 'a.txt', nodeType: 'file' };

  it('resolve 命中优先级最高的插件并返回其 info 与 input', () => {
    const registry = createNodePluginRegistry();

    registry.register(makePlugin('low', { priority: 1 }));
    registry.register(makePlugin('high', { priority: 9 }));

    const resolved = registry.resolve(input);

    expect(resolved.plugin.id).toBe('high');
    expect(resolved.info).toEqual(TEXT_INFO);
    expect(resolved.input).toBe(input);
  });

  it('同优先级时后注册者优先', () => {
    const registry = createNodePluginRegistry();

    registry.register(makePlugin('first'));
    registry.register(makePlugin('second'));

    expect(registry.resolve(input).plugin.id).toBe('second');
  });

  it('无匹配插件时抛出包含文件名的错误', () => {
    const registry = createNodePluginRegistry([
      { ...makePlugin('none'), match: () => false },
    ]);

    expect(() => registry.resolve(input)).toThrow(
      'No node plugin matched "a.txt"',
    );
  });

  it('list 按注册顺序返回插件', () => {
    const first = makePlugin('first');
    const second = makePlugin('second');

    const registry = createNodePluginRegistry([first, second]);

    expect(registry.list()).toEqual([first, second]);
  });

  it('注册后立即可解析', () => {
    const registry = createNodePluginRegistry();

    expect(registry.list()).toEqual([]);
    expect(() => registry.resolve(input)).toThrow(
      'No node plugin matched "a.txt"',
    );

    registry.register(makePlugin('late'));

    expect(registry.resolve(input).plugin.id).toBe('late');
  });
});

describe('createNodePlugin 扩展名匹配', () => {
  const plugin = createNodePlugin({
    id: 'text',
    defaultInfo: {
      iconClass: 'icon-default',
      className: 'default',
      mime: 'text/plain',
    },
    extensions: {
      '.TXT': { iconClass: 'icon-txt', className: 'txt' },
      PNG: { iconClass: 'icon-png', className: 'png' },
    },
  });

  it('扩展名归一化大小写与前导点', () => {
    expect(plugin.match({ name: 'a.txt', nodeType: 'file' })).toBe(true);
    expect(plugin.match({ name: 'a.TXT', nodeType: 'file' })).toBe(true);
    expect(plugin.match({ name: 'a.png', nodeType: 'file' })).toBe(true);
    expect(plugin.match({ name: 'a.PNG', nodeType: 'file' })).toBe(true);
    expect(plugin.match({ name: 'a.jpg', nodeType: 'file' })).toBe(false);
  });

  it('getInfo 合并 defaultInfo 与扩展名信息', () => {
    expect(plugin.getInfo({ name: 'a.txt', nodeType: 'file' })).toEqual({
      iconClass: 'icon-txt',
      className: 'txt',
      mime: 'text/plain',
    });
  });

  it('folder 一律不匹配', () => {
    expect(plugin.match({ name: 'a.txt', nodeType: 'folder' })).toBe(false);
  });

  it('无扩展名信息时 getInfo 抛出插件自定义错误', () => {
    expect(() => plugin.getInfo({ name: 'a.jpg', nodeType: 'file' })).toThrow(
      'Node plugin "text" cannot describe input',
    );
  });

  it('未声明任何扩展名时 match 返回 false', () => {
    const empty = createNodePlugin({ id: 'empty' });

    expect(empty.match({ name: 'a.txt', nodeType: 'file' })).toBe(false);
  });
});

describe('createNodePlugin 复合后缀优先', () => {
  const plugin = createNodePlugin({
    id: 'archive',
    defaultInfo: { iconClass: 'icon-file', className: 'file' },
    extensions: {
      gz: { iconClass: 'icon-gz', className: 'gz' },
      tar: { iconClass: 'icon-tar', className: 'tar' },
    },
    compoundExtensions: {
      '.TAR.GZ': { iconClass: 'icon-tgz', className: 'tgz' },
    },
  });

  it('复合后缀优先于单后缀', () => {
    expect(plugin.match({ name: 'backup.tar.gz', nodeType: 'file' })).toBe(
      true,
    );
    expect(plugin.getInfo({ name: 'backup.tar.gz', nodeType: 'file' })).toEqual(
      { iconClass: 'icon-tgz', className: 'tgz' },
    );
  });

  it('未命中复合后缀时回退到单后缀', () => {
    expect(plugin.getInfo({ name: 'backup.tar', nodeType: 'file' })).toEqual({
      iconClass: 'icon-tar',
      className: 'tar',
    });
    expect(plugin.getInfo({ name: 'data.gz', nodeType: 'file' })).toEqual({
      iconClass: 'icon-gz',
      className: 'gz',
    });
  });
});

describe('createNodePlugin 自定义 match / getInfo 优先', () => {
  it('自定义 match 完全接管匹配', () => {
    const plugin = createNodePlugin({
      id: 'custom-match',
      extensions: { txt: { iconClass: 'icon-txt', className: 'txt' } },
      match: input => input.name === 'special.bin',
    });

    expect(plugin.match({ name: 'special.bin', nodeType: 'file' })).toBe(true);
    expect(plugin.match({ name: 'a.txt', nodeType: 'file' })).toBe(false);
    expect(plugin.match({ name: 'special.bin', nodeType: 'folder' })).toBe(
      true,
    );
  });

  it('自定义 getInfo 优先于扩展名合并', () => {
    const plugin = createNodePlugin({
      id: 'custom-info',
      defaultInfo: { iconClass: 'icon-default', className: 'default' },
      extensions: { txt: {} },
      getInfo: () => ({ iconClass: 'icon-custom', className: 'custom' }),
    });

    expect(plugin.getInfo({ name: 'a.txt', nodeType: 'file' })).toEqual({
      iconClass: 'icon-custom',
      className: 'custom',
    });
  });
});

describe('createNodePlugin 类型信息校验', () => {
  it('缺少 iconClass 时抛错', () => {
    const plugin = createNodePlugin({
      id: 'no-icon',
      defaultInfo: { className: 'default' },
      extensions: { txt: {} },
    });

    expect(() => plugin.getInfo({ name: 'a.txt', nodeType: 'file' })).toThrow(
      'Node plugin type info requires iconClass and className',
    );
  });

  it('缺少 className 时抛错', () => {
    const plugin = createNodePlugin({
      id: 'no-class',
      defaultInfo: { iconClass: 'icon-default' },
      extensions: { txt: {} },
    });

    expect(() => plugin.getInfo({ name: 'a.txt', nodeType: 'file' })).toThrow(
      'Node plugin type info requires iconClass and className',
    );
  });

  it('扩展名信息覆盖 defaultInfo 的同名字段', () => {
    const plugin = createNodePlugin({
      id: 'override',
      defaultInfo: { iconClass: 'icon-default', className: 'default' },
      extensions: { txt: { iconClass: 'icon-txt' } },
    });

    expect(plugin.getInfo({ name: 'a.txt', nodeType: 'file' })).toEqual({
      iconClass: 'icon-txt',
      className: 'default',
    });
  });
});

describe('createNodePlugin preview 透传', () => {
  it('未提供 preview 时字段为 undefined', () => {
    expect(createNodePlugin({ id: 'plain' }).preview).toBeUndefined();
  });

  it('提供的 preview 被原样透传并收到完整输入', async () => {
    const preview: NonNullable<NodePlugin['preview']> = async input => {
      expect(input.fileUrl).toBe(
        'https://cdn.jsdelivr.net/owner/repo@main/a.txt',
      );
      expect(input.nodeTypeInfo).toEqual(TEXT_INFO);

      return false;
    };
    const plugin = createNodePlugin({ id: 'preview', preview });

    expect(plugin.preview).toBe(preview);

    const result = await plugin.preview?.({
      name: 'a.txt',
      nodeType: 'file',
      fileUrl: 'https://cdn.jsdelivr.net/owner/repo@main/a.txt',
      nodeTypeInfo: TEXT_INFO,
    });

    expect(result).toBe(false);
  });
});

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { Logger } from '@share-file/types/logger';

// --- 插件类型定义 ---
export type HookHandler = (...args: unknown[]) => unknown | Promise<unknown>;

export interface PluginHandle {
  name: string;
  provides?: string[];
  priority?: number;
  hooks?: Record<string, HookHandler>;
}

export interface PluginContext {
  logger: Logger;
  options?: Record<string, unknown>;
  // 供插件在运行时注册额外的 hook 或事件（轻量版）
  registerHook?: (
    hookName: string,
    handler: HookHandler,
    priority?: number,
  ) => void;
}

/** 简单的运行时插件注册表实现。可按目录加载插件模块并按顺序调用 hook。 */
export class PluginRegistry {
  private plugins: PluginHandle[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  register(plugin: PluginHandle) {
    this.plugins.push(plugin);
    this.plugins.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    this.logger.debug(`已注册插件: ${plugin.name}`);
  }

  async loadFromDir(dir: string, ctx?: PluginContext) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);

    for (const ent of entries) {
      if (!ent.endsWith('.js') && !ent.endsWith('.ts')) continue;
      const full = path.resolve(dir, ent);

      try {
        // 动态 import，兼容 tsx/node 的运行时导入 .ts 文件
        const mod = await import(pathToFileURL(full).href);
        const exported = mod.default ?? mod.register ?? mod;

        if (typeof exported === 'function') {
          const plugin = await exported(ctx ?? { logger: this.logger });
          if (plugin && plugin.name) this.register(plugin as PluginHandle);
        } else if (exported && exported.name) {
          this.register(exported as PluginHandle);
        }
      } catch (err) {
        this.logger.warn(`加载插件失败: ${full} -> ${String(err)}`);
      }
    }
  }

  /**
   * 依次调用所有已注册插件中包含指定 hook 的处理器。
   * 返回每个 handler 的结果数组（保留顺序）。
   */
  async runHook<T = unknown>(
    hookName: string,
    ...args: unknown[]
  ): Promise<T[]> {
    const results: T[] = [];

    for (const p of this.plugins) {
      const h = p.hooks?.[hookName];

      if (typeof h === 'function') {
        try {
          // 支持同步或异步 handler

          const res = await h(...args);
          results.push(res as T);
        } catch (err) {
          this.logger.warn(
            `插件 ${p.name} 的 hook ${hookName} 抛出错误: ${String(err)}`,
          );
        }
      }
    }

    return results;
  }

  listPlugins(): string[] {
    return this.plugins.map(p => p.name);
  }
}

export default PluginRegistry;

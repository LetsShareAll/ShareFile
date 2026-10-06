import { createNodePluginRegistry } from '../domain/plugins';
import type { NodePluginRegistry } from '../domain/plugins';

import { builtinNodePlugins } from './node/builtinPlugins';

export { builtinNodePlugins };

/**
 * 内置插件注册表（每实例独立，便于测试与后续按需扩展）。
 */
export function createBuiltinRegistry(): NodePluginRegistry {
  return createNodePluginRegistry(builtinNodePlugins);
}

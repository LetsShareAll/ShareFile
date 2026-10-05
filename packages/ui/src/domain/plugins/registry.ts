import type {
  NodePlugin,
  NodePluginMatchInput,
  ResolvedNodePlugin,
} from './types';

interface RegisteredNodePlugin {
  plugin: NodePlugin;
  registrationOrder: number;
}

export interface NodePluginRegistry {
  register(plugin: NodePlugin): void;
  resolve(input: NodePluginMatchInput): ResolvedNodePlugin;
  list(): NodePlugin[];
}

/**
 * 优先级降序；同优先级后注册者优先（与既有插件语义一致）。
 */
export function compareRegisteredPlugins(
  left: RegisteredNodePlugin,
  right: RegisteredNodePlugin,
): number {
  const priorityDiff =
    (right.plugin.priority ?? 0) - (left.plugin.priority ?? 0);

  if (priorityDiff !== 0) return priorityDiff;

  return right.registrationOrder - left.registrationOrder;
}

/**
 * 每实例独立注册表，避免模块级全局状态（可测试、便于 SSR）。
 */
export function createNodePluginRegistry(
  plugins: NodePlugin[] = [],
): NodePluginRegistry {
  const registered: RegisteredNodePlugin[] = [];
  let nextRegistrationOrder = 0;

  function register(plugin: NodePlugin): void {
    registered.push({ plugin, registrationOrder: nextRegistrationOrder });
    nextRegistrationOrder += 1;
  }

  plugins.forEach(register);

  function resolve(input: NodePluginMatchInput): ResolvedNodePlugin {
    const matched = registered
      .slice()
      .sort(compareRegisteredPlugins)
      .find(candidate => candidate.plugin.match(input));

    if (!matched) {
      throw new Error(`No node plugin matched "${input.name}"`);
    }

    return {
      plugin: matched.plugin,
      info: matched.plugin.getInfo(input),
      input,
    };
  }

  return {
    register,
    resolve,
    list: () => registered.map(candidate => candidate.plugin),
  };
}

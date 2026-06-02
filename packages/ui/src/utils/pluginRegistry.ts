import { builtinNodePlugins } from '../plugins/node/builtinPlugins';
import {
  NodePlugin,
  NodePluginMatchInput,
  NodeTypeInfo,
  ResolvedNodePlugin,
} from '../plugins/node/types';

interface RegisteredNodePlugin {
  plugin: NodePlugin;
  registrationOrder: number;
}

const registeredNodePlugins: RegisteredNodePlugin[] = [];
let nextRegistrationOrder = 0;

export function registerNodePlugin(plugin: NodePlugin): void {
  registeredNodePlugins.push({
    plugin,
    registrationOrder: nextRegistrationOrder,
  });
  nextRegistrationOrder += 1;
}

for (const plugin of builtinNodePlugins) {
  registerNodePlugin(plugin);
}

function compareRegisteredPlugins(
  left: RegisteredNodePlugin,
  right: RegisteredNodePlugin,
): number {
  const priorityDiff =
    (right.plugin.priority ?? 0) - (left.plugin.priority ?? 0);
  if (priorityDiff !== 0) return priorityDiff;

  return right.registrationOrder - left.registrationOrder;
}

export function resolveNodePlugin(
  input: NodePluginMatchInput,
): ResolvedNodePlugin {
  const registeredPlugin = registeredNodePlugins
    .slice()
    .sort(compareRegisteredPlugins)
    .find(candidate => candidate.plugin.match(input));

  if (!registeredPlugin) {
    throw new Error(`No node plugin matched "${input.name}"`);
  }

  return {
    plugin: registeredPlugin.plugin,
    info: registeredPlugin.plugin.getInfo(input),
    input,
  };
}

export async function previewWithResolvedNodePlugin(
  resolved: ResolvedNodePlugin,
  fileUrl: string,
): Promise<HTMLElement | string | false> {
  if (!resolved.plugin.preview) return false;

  try {
    return await resolved.plugin.preview({
      ...resolved.input,
      fileUrl,
      nodeTypeInfo: resolved.info,
    });
  } catch {
    return false;
  }
}

export type {
  NodePlugin,
  NodePluginMatchInput,
  NodeTypeInfo,
  ResolvedNodePlugin,
};

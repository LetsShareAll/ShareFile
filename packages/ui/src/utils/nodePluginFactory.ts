import {
  NodePlugin,
  NodePluginMatchInput,
  NodeTypeInfo,
} from '../plugins/node/types';

type PartialNodeTypeInfo = Partial<NodeTypeInfo>;

export interface DeclarativeNodePluginOptions {
  id: string;
  priority?: number;
  defaultInfo?: PartialNodeTypeInfo;
  extensions?: Record<string, PartialNodeTypeInfo>;
  compoundExtensions?: Record<string, PartialNodeTypeInfo>;
  match?: (input: NodePluginMatchInput) => boolean;
  getInfo?: (input: NodePluginMatchInput) => NodeTypeInfo;
  preview?: NodePlugin['preview'];
}

function normalizeExtension(extension: string): string {
  return extension.replace(/^\./, '').toLowerCase();
}

function normalizeMap(
  map?: Record<string, PartialNodeTypeInfo>,
): Record<string, PartialNodeTypeInfo> {
  if (!map) return {};

  return Object.fromEntries(
    Object.entries(map).map(([extension, info]) => [
      normalizeExtension(extension),
      info,
    ]),
  );
}

function getExtensionInfo(
  fileName: string,
  extensions: Record<string, PartialNodeTypeInfo>,
  compoundExtensions: Record<string, PartialNodeTypeInfo>,
): PartialNodeTypeInfo | undefined {
  const normalizedName = fileName.toLowerCase();

  for (const [extension, info] of Object.entries(compoundExtensions)) {
    if (normalizedName.endsWith(`.${extension}`)) return info;
  }

  const extension = normalizedName.split('.').pop() || '';
  return extensions[extension];
}

function mergeInfo(
  defaultInfo: PartialNodeTypeInfo,
  extensionInfo: PartialNodeTypeInfo,
): NodeTypeInfo {
  const info = { ...defaultInfo, ...extensionInfo };

  if (!info.iconClass || !info.className) {
    throw new Error('Node plugin type info requires iconClass and className');
  }

  return info as NodeTypeInfo;
}

export function createNodePlugin(
  options: DeclarativeNodePluginOptions,
): NodePlugin {
  const extensions = normalizeMap(options.extensions);
  const compoundExtensions = normalizeMap(options.compoundExtensions);
  const hasDeclarativeMatchers =
    Object.keys(extensions).length > 0 ||
    Object.keys(compoundExtensions).length > 0;

  const plugin: NodePlugin = {
    id: options.id,
    priority: options.priority,
    match(input) {
      if (options.match) return options.match(input);
      if (input.nodeType !== 'file') return false;
      if (!hasDeclarativeMatchers) return false;

      return Boolean(
        getExtensionInfo(input.name, extensions, compoundExtensions),
      );
    },
    getInfo(input) {
      if (options.getInfo) return options.getInfo(input);

      const extensionInfo = getExtensionInfo(
        input.name,
        extensions,
        compoundExtensions,
      );

      if (!extensionInfo) {
        throw new Error(`Node plugin "${options.id}" cannot describe input`);
      }

      return mergeInfo(options.defaultInfo || {}, extensionInfo);
    },
  };

  if (options.preview) {
    plugin.preview = options.preview;
  }

  return plugin;
}

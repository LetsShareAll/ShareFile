export interface ShareNodeLike {
  readonly id?: string;
  readonly name: string;
  readonly type: 'file' | 'folder';
}

export interface NodePluginMatchInput {
  name: string;
  nodeType: 'file' | 'folder';
  node?: ShareNodeLike;
}

export interface NodeTypeInfo {
  iconClass: string;
  className: string;
  mime?: string;
}

export interface NodePluginPreviewInput extends NodePluginMatchInput {
  fileUrl: string;
  nodeTypeInfo: NodeTypeInfo;
}

export interface NodePlugin {
  id: string;
  priority?: number;
  match(input: NodePluginMatchInput): boolean;
  getInfo(input: NodePluginMatchInput): NodeTypeInfo;
  preview?(
    input: NodePluginPreviewInput,
  ): HTMLElement | string | false | Promise<HTMLElement | string | false>;
}

export interface ResolvedNodePlugin {
  plugin: NodePlugin;
  info: NodeTypeInfo;
  input: NodePluginMatchInput;
}

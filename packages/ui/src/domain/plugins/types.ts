import type { Component } from 'vue';

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

/**
 * 预览结果：返回 Vue 组件，或 false 表示该插件不处理（交给浏览器直接打开）。
 */
export type NodePluginPreviewResult = Component | false;

export interface NodePlugin {
  id: string;
  priority?: number;
  match(input: NodePluginMatchInput): boolean;
  getInfo(input: NodePluginMatchInput): NodeTypeInfo;
  preview?(input: NodePluginPreviewInput): Promise<NodePluginPreviewResult>;
}

export interface ResolvedNodePlugin {
  plugin: NodePlugin;
  info: NodeTypeInfo;
  input: NodePluginMatchInput;
}

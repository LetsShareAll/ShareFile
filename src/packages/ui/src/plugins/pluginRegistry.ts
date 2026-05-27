import {
  FileTypeInfo,
  FileTypePlugin,
  defaultFileTypePlugin,
} from './fileTypePlugin';
import { PreviewPlugin, defaultPreviewPlugin } from './previewPlugin';

const fileTypePlugins: FileTypePlugin[] = [defaultFileTypePlugin];
const previewPlugins: PreviewPlugin[] = [defaultPreviewPlugin];

export function registerFileTypePlugin(plugin: FileTypePlugin): void {
  fileTypePlugins.push(plugin);
}

export function registerPreviewPlugin(plugin: PreviewPlugin): void {
  previewPlugins.push(plugin);
}

export function getFileTypeInfo(
  name: string,
  type: 'file' | 'folder',
): FileTypeInfo {
  for (let i = fileTypePlugins.length - 1; i >= 0; i--) {
    const plugin = fileTypePlugins[i];

    if (plugin.supports(name, type)) {
      return plugin.getInfo(name, type);
    }
  }

  return defaultFileTypePlugin.getInfo(name, type);
}

export async function previewWithPlugins(
  fileName: string,
  fileUrl: string,
  fileTypeInfo: FileTypeInfo,
): Promise<HTMLElement | string | false> {
  for (const plugin of previewPlugins) {
    const result = await plugin.preview(fileName, fileUrl, fileTypeInfo);

    if (result) {
      return result;
    }
  }

  return false;
}

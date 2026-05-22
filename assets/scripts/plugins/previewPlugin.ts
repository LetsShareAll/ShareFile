import { FileTypeInfo } from './fileTypePlugin';

declare const marked: { parse(md: string): string };

export interface PreviewPlugin {
  preview(
    fileName: string,
    fileUrl: string,
    fileTypeInfo: FileTypeInfo,
  ): Promise<HTMLElement | string | false>;
}

const textMimes = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
];

const textExts = new Set([
  'txt',
  'md',
  'json',
  'xml',
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'log',
  'csv',
  'tsv',
  'reg',
  'ps1',
  'sh',
  'bash',
  'zsh',
  'bat',
  'py',
  'rb',
  'php',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'rs',
  'go',
  'swift',
  'kt',
  'scala',
  'lua',
  'r',
  'sql',
  'graphql',
  'vue',
  'svelte',
  'list',
]);

function isTextFileByName(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return textExts.has(ext);
}

export const defaultPreviewPlugin: PreviewPlugin = {
  async preview(fileName, fileUrl, fileTypeInfo) {
    const { mime } = fileTypeInfo;
    const isText = mime && textMimes.some(prefix => mime.startsWith(prefix));
    const canPreviewAsText = isText || (!mime && isTextFileByName(fileName));

    try {
      if (canPreviewAsText) {
        const resp = await fetch(fileUrl);
        const text = await resp.text();
        const ext = fileName.toLowerCase().split('.').pop();

        if (ext === 'md') {
          const div = document.createElement('div');
          div.className = 'rendered-markdown';
          div.innerHTML = marked.parse(text);
          return div;
        }

        const pre = document.createElement('pre');
        pre.style.whiteSpace = 'pre-wrap';
        pre.textContent = text;
        const wrapper = document.createElement('div');
        wrapper.className = 'rendered-markdown';
        wrapper.appendChild(pre);
        return wrapper;
      }

      if (mime?.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = fileUrl;
        img.style.maxWidth = '100%';
        img.style.display = 'block';
        img.style.margin = '0 auto';
        return img;
      }

      if (mime?.startsWith('video/')) {
        const video = document.createElement('video');
        video.controls = true;
        video.src = fileUrl;
        video.style.maxWidth = '100%';
        video.style.display = 'block';
        video.style.margin = '0 auto';
        return video;
      }

      if (mime?.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = fileUrl;
        audio.style.width = '100%';
        const wrapper = document.createElement('div');
        wrapper.style.textAlign = 'center';
        wrapper.style.padding = '2rem 0';
        wrapper.appendChild(audio);
        return wrapper;
      }

      if (mime === 'application/pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = fileUrl;
        iframe.style.width = '100%';
        iframe.style.height = '70vh';
        iframe.style.border = 'none';
        return iframe;
      }
    } catch {
      return false;
    }

    return false;
  },
};

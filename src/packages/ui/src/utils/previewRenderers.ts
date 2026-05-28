import { NodePluginPreviewInput } from '../plugins/node/types';

declare const marked: { parse(md: string): string };

export async function fetchPreviewText(
  input: NodePluginPreviewInput,
): Promise<string> {
  const resp = await fetch(input.fileUrl);
  return resp.text();
}

export function createCopyButton(text: string): HTMLButtonElement {
  const copyButton = document.createElement('button');

  copyButton.className = 'code-copy-button';
  copyButton.type = 'button';
  copyButton.innerHTML = '<i class="fas fa-copy"></i><span>复制</span>';
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      copyButton.innerHTML = '<i class="fas fa-check"></i><span>已复制</span>';
      setTimeout(() => {
        copyButton.innerHTML = '<i class="fas fa-copy"></i><span>复制</span>';
      }, 1400);
    } catch {
      copyButton.innerHTML =
        '<i class="fas fa-exclamation-triangle"></i><span>失败</span>';
      setTimeout(() => {
        copyButton.innerHTML = '<i class="fas fa-copy"></i><span>复制</span>';
      }, 1400);
    }
  });

  return copyButton;
}

export function createLineNumberedCodeBlock(
  lines: readonly string[],
): HTMLElement {
  const scroller = document.createElement('div');
  const codeTable = document.createElement('div');

  scroller.className = 'code-preview-content';
  codeTable.className = 'code-preview-table';

  lines.forEach((lineHtml, index) => {
    const row = document.createElement('div');
    const lineNumber = document.createElement('span');
    const code = document.createElement('code');

    row.className = 'code-preview-line';
    lineNumber.className = 'code-line-number';
    lineNumber.textContent = String(index + 1);
    code.className = 'code-line-content hljs';
    code.innerHTML = lineHtml || ' ';

    row.append(lineNumber, code);
    codeTable.appendChild(row);
  });

  scroller.appendChild(codeTable);

  return scroller;
}

export async function renderPlainTextPreview(
  input: NodePluginPreviewInput,
): Promise<HTMLElement> {
  const text = await fetchPreviewText(input);
  const pre = document.createElement('pre');

  pre.style.whiteSpace = 'pre-wrap';
  pre.textContent = text;

  const wrapper = document.createElement('div');
  wrapper.className = 'rendered-markdown';
  wrapper.appendChild(pre);

  return wrapper;
}

export async function renderMarkdownPreview(
  input: NodePluginPreviewInput,
): Promise<HTMLElement> {
  const text = await fetchPreviewText(input);
  const div = document.createElement('div');

  div.className = 'rendered-markdown';
  div.innerHTML = marked.parse(text);

  return div;
}

export function renderImagePreview(fileUrl: string): HTMLElement {
  const img = document.createElement('img');

  img.src = fileUrl;
  img.style.maxWidth = '100%';
  img.style.display = 'block';
  img.style.margin = '0 auto';

  return img;
}

export function renderPdfPreview(fileUrl: string): HTMLElement {
  const iframe = document.createElement('iframe');

  iframe.src = fileUrl;
  iframe.style.width = '100%';
  iframe.style.height = '70vh';
  iframe.style.border = 'none';

  return iframe;
}

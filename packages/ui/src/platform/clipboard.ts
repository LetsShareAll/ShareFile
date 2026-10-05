/**
 * 复制文本：优先 Clipboard API，失败时退回临时 textarea（非安全上下文也能用）。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);

      return true;
    }
  } catch {
    // 落到下面的兜底实现。
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);

    return succeeded;
  } catch {
    return false;
  }
}

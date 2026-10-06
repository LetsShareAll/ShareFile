import { afterEach, describe, expect, it, vi } from 'vitest';

import { triggerFileDownload } from '@/platform/download';
import type { ShareNode } from '@/domain/share-file';

import { makeNode } from './helpers';

function captureAnchor(node: ShareNode): HTMLAnchorElement {
  let captured: HTMLAnchorElement | null = null;

  // 只记录不替换实现：替换掉 appendChild 会让函数末尾的 removeChild 抛错。
  const appendSpy = vi.spyOn(document.body, 'appendChild');
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);

  try {
    triggerFileDownload(node);
    captured = (appendSpy.mock.calls[0]?.[0] ??
      null) as HTMLAnchorElement | null;
  } finally {
    appendSpy.mockRestore();
    clickSpy.mockRestore();
  }

  if (!captured) throw new Error('未创建下载链接');

  return captured;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('triggerFileDownload 的跨域语义', () => {
  it('同源文件：原地下载（无 target/rel）', () => {
    const anchor = captureAnchor(
      makeNode('a.txt', 'file', { name: 'a.txt', url: '/local/a.txt' }),
    );

    expect(anchor.download).toBe('a.txt');
    expect(anchor.getAttribute('target')).toBeNull();
    expect(anchor.getAttribute('rel')).toBeNull();
  });

  it('跨域直链：开新标签并带 noopener（避免 download 属性被忽略后导航走整个 SPA）', () => {
    const anchor = captureAnchor(
      makeNode('a.txt', 'file', {
        name: 'a.txt',
        url: 'https://cdn.example.com/a.txt',
      }),
    );

    expect(anchor.download).toBe('a.txt');
    expect(anchor.getAttribute('target')).toBe('_blank');
    expect(anchor.getAttribute('rel')).toBe('noopener');
  });

  it('没有 url 的节点回退到站内路径', () => {
    const anchor = captureAnchor(
      makeNode('dir/a.txt', 'file', { name: 'a.txt' }),
    );

    expect(anchor.getAttribute('href')).toBe('/dir/a.txt');
  });
});

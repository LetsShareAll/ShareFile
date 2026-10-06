import { sanitizeRoutePath } from '../../domain/paths';
import { decodePathname } from '../../platform/navigation';

/**
 * 读取 `?preview=`：走与路由相同的白名单收敛，空值与非法值（协议相对地址、`..` 等）视为没有预览。
 */
export function readPreviewPath(search: string): string | null {
  const value = new URLSearchParams(search).get('preview')?.trim();

  if (!value) return null;

  const path = sanitizeRoutePath(value);

  return path === '/' ? null : path;
}

/**
 * 启动时的 `?preview=`：vue-router 会用 clean URL 覆盖地址栏（`?path=` 收敛 + 初始 `replace`），
 * 所以先查 Navigation Timing 里本文档的原始地址，拿不到再退回当前 search。
 * 只在启动时用一次，之后的深链同步一律读实时地址。
 */
export function readBootPreviewPath(): string | null {
  const [navigation] = performance.getEntriesByType('navigation');

  if (navigation?.name) {
    try {
      const path = readPreviewPath(new URL(navigation.name).search);

      if (path) return path;
    } catch {
      // 原始地址不可解析时退回当前 search。
    }
  }

  return readPreviewPath(window.location.search);
}

/**
 * 生成带 / 不带 `?preview=` 的站内地址：保留 pathname、其余查询参数与 hash。
 * `previewPath` 为 null 时清除该参数（关闭预览用，配合 replaceState 不堆历史记录）。
 */
export function buildPreviewHref(
  href: string,
  previewPath: string | null,
): string {
  const url = new URL(href);

  if (previewPath) {
    url.searchParams.set('preview', previewPath);
  } else {
    url.searchParams.delete('preview');
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/** 当前目录：clean URL 的 pathname 就是正在浏览的目录（搜索态也一样）。 */
export function resolveDirectoryPath(): string {
  return sanitizeRoutePath(decodePathname(window.location.pathname));
}

/** 写入地址栏：首次打开 push（浏览器后退即可关闭），切换 / 关闭 replace（不堆记录）。 */
export function writePreviewUrl(
  mode: 'push' | 'replace',
  previewPath: string | null,
): void {
  const href = buildPreviewHref(window.location.href, previewPath);
  const { state } = window.history;

  if (mode === 'push') {
    window.history.pushState(state, '', href);

    return;
  }

  window.history.replaceState(state, '', href);
}

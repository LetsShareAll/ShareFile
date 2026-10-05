import { createRouter, createWebHistory, type Router } from 'vue-router';

import { formatBrowserPath, sanitizeRoutePath } from '../domain/paths';
import { createSessionStorage } from '../platform/storage';
import {
  clearPendingRoute,
  decodePathname,
  readPendingRoute,
} from '../platform/navigation';

/**
 * 计算首屏路径并决定是否需要把地址栏改写成 clean URL。
 *
 * 优先级与旧实现一致：pathname > 404.html 写入的 pendingRoute > `?path=`。
 */
export function resolveInitialRoute(
  pathname: string,
  search: string,
  pendingRoute: string | null,
): { path: string; needsRewrite: boolean } {
  const currentPath = sanitizeRoutePath(decodePathname(pathname));
  const queryPath = sanitizeRoutePath(
    new URLSearchParams(search).get('path') ?? '/',
  );

  if (pendingRoute) {
    const normalizedPending = sanitizeRoutePath(pendingRoute);

    if (normalizedPending !== currentPath) {
      return { path: normalizedPending, needsRewrite: true };
    }
  }

  if (currentPath === '/' && queryPath !== '/') {
    return { path: queryPath, needsRewrite: true };
  }

  return { path: currentPath, needsRewrite: false };
}

/**
 * 启动路由：单条 catch-all 路由承接所有路径，与旧实现的「路径即状态」语义一致。
 */
export async function bootstrapRouter(): Promise<Router> {
  const router = createRouter({
    history: createWebHistory('/'),
    routes: [
      {
        path: '/:pathMatch(.*)*',
        name: 'browse',
        component: () => import('../features/browse/BrowseView.vue'),
      },
    ],
  });

  const sessionStorage = createSessionStorage();
  const initial = resolveInitialRoute(
    window.location.pathname,
    window.location.search,
    readPendingRoute(sessionStorage),
  );

  clearPendingRoute(sessionStorage);

  if (initial.needsRewrite) {
    window.history.replaceState(
      { path: initial.path },
      '',
      formatBrowserPath(initial.path),
    );
  }

  // 带 `?path=` 的链接一律收敛为 clean URL（旧实现用 replaceState 做同样的事）。
  router.beforeEach(to => {
    const queryPath = to.query.path;

    if (typeof queryPath !== 'string' || !queryPath) return true;

    return { path: sanitizeRoutePath(queryPath), replace: true };
  });

  await router.replace(initial.path);
  await router.isReady();

  return router;
}

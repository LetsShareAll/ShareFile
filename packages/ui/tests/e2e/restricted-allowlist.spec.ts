import type { Page } from '@playwright/test';

import { expect, test } from './base';

/**
 * 受限内容（restricted）与外挂挂载源准入清单（allow_paths / deny_paths）的端到端用例。
 *
 * 全部数据都是夹具：本地索引 + 外挂索引都由 `page.route` 现造，不依赖线上仓库，
 * 因此断言的节点集合完全可控。
 */

const FIXTURE_HOST = 'https://fixture.example.com';
const NOTICE_FRAGMENT = '无法阻止直接访问';
const PREVIEW_BODY = 'restricted preview content';

/**
 * 本地索引夹具：只声明一个带准入清单的外挂挂载点。
 * allow_paths 非空即白名单，deny_paths 优先剔除命中的节点及其子树。
 */
const LOCAL_INDEX = {
  root_id: 'root',
  path_index: { '/': 'root', '/fixture': 'fixture' },
  nodes: {
    root: {
      id: 'root',
      name: '/',
      type: 'folder',
      parent: null,
      children: ['fixture'],
      description: '夹具根目录',
    },
    fixture: {
      id: 'fixture',
      name: 'fixture',
      type: 'folder',
      parent: 'root',
      children: [],
      description: '外挂夹具',
      mount_source: {
        provider: 'github',
        repository: 'fixture/repo',
        branch: 'main',
        sub_path: '/',
        access_cdn: FIXTURE_HOST,
        use_cdn_index: false,
        allow_paths: ['/allowed', '/restricted-note.txt', '/restricted-dir'],
        deny_paths: ['/allowed/denied'],
      },
    },
  },
};

/**
 * 外挂索引夹具：
 * - `restricted-note.txt` / `restricted-dir` 受限；
 * - `other/` 未命中 allow_paths，整体消失；
 * - `allowed/denied/` 命中 deny_paths，连同子树消失；
 * - `allowed/open.txt` 是未受限的邻居。
 */
const EXTERNAL_INDEX = {
  root_id: 'root',
  path_index: {
    '/': 'root',
    '/allowed': 'allowed',
    '/allowed/open.txt': 'allowed/open.txt',
    '/allowed/denied': 'allowed/denied',
    '/allowed/denied/secret.txt': 'allowed/denied/secret.txt',
    '/other': 'other',
    '/other/hidden.txt': 'other/hidden.txt',
    '/restricted-note.txt': 'restricted-note.txt',
    '/restricted-dir': 'restricted-dir',
    '/restricted-dir/inner.txt': 'restricted-dir/inner.txt',
  },
  nodes: {
    root: {
      id: 'root',
      name: '/',
      type: 'folder',
      parent: null,
      children: ['allowed', 'other', 'restricted-note.txt', 'restricted-dir'],
      description: '夹具外挂根',
    },
    allowed: {
      id: 'allowed',
      name: 'allowed',
      type: 'folder',
      parent: 'root',
      children: ['allowed/open.txt', 'allowed/denied'],
      description: '白名单目录',
    },
    'allowed/open.txt': {
      id: 'allowed/open.txt',
      name: 'open.txt',
      type: 'file',
      parent: 'allowed',
      children: [],
      size: 32,
      updated_at: '2026-01-01T00:00:00Z',
    },
    'allowed/denied': {
      id: 'allowed/denied',
      name: 'denied',
      type: 'folder',
      parent: 'allowed',
      children: ['allowed/denied/secret.txt'],
      description: '被 deny 的目录',
    },
    'allowed/denied/secret.txt': {
      id: 'allowed/denied/secret.txt',
      name: 'secret.txt',
      type: 'file',
      parent: 'allowed/denied',
      children: [],
      size: 16,
    },
    other: {
      id: 'other',
      name: 'other',
      type: 'folder',
      parent: 'root',
      children: ['other/hidden.txt'],
      description: '白名单外目录',
    },
    'other/hidden.txt': {
      id: 'other/hidden.txt',
      name: 'hidden.txt',
      type: 'file',
      parent: 'other',
      children: [],
      size: 16,
    },
    'restricted-note.txt': {
      id: 'restricted-note.txt',
      name: 'restricted-note.txt',
      type: 'file',
      parent: 'root',
      children: [],
      restricted: true,
      size: 64,
      updated_at: '2026-01-02T00:00:00Z',
    },
    'restricted-dir': {
      id: 'restricted-dir',
      name: 'restricted-dir',
      type: 'folder',
      parent: 'root',
      children: ['restricted-dir/inner.txt'],
      restricted: true,
      description: '受限目录',
    },
    'restricted-dir/inner.txt': {
      id: 'restricted-dir/inner.txt',
      name: 'inner.txt',
      type: 'file',
      parent: 'restricted-dir',
      children: [],
      size: 16,
    },
  },
};

/**
 * 安装夹具：本地索引走 `share-file.json`（dev）与 `share-file.cdn.json`（preview），
 * 外挂索引与文件内容由 FIXTURE_HOST 统一提供。
 *
 * `localStorage.clear()` 在每次导航前执行，避免预热用的真实外挂缓存干扰断言。
 */
async function installFixture(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear());

  const localIndex = {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(LOCAL_INDEX),
  };

  await page.route('**/assets/data/share-file.json', route =>
    route.fulfill(localIndex),
  );
  await page.route('**/assets/data/share-file.cdn.json', route =>
    route.fulfill(localIndex),
  );

  await page.route(`${FIXTURE_HOST}/**`, route => {
    const { pathname } = new URL(route.request().url());

    if (pathname.endsWith('share-file.json')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EXTERNAL_INDEX),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: PREVIEW_BODY,
    });
  });
}

test('受限文件带标识、三个复制动作禁用，预览仍可打开', async ({ page }) => {
  await installFixture(page);
  await page.goto('/fixture');

  // 挂载合并完成后只剩白名单内的三个节点。
  await expect(page.locator('.file-item')).toHaveCount(3);

  const item = page.locator('.file-item', { hasText: 'restricted-note.txt' });
  const indicator = item.locator('.restricted-indicator');

  await expect(indicator).toBeVisible();
  await expect(indicator).toContainText('受限');
  await expect(indicator).toHaveAttribute('title', /无法阻止直接访问/);
  await expect(indicator).toHaveAttribute('aria-label', /无法阻止直接访问/);

  const disabledActions = item.locator('.item-actions button:disabled');

  await expect(disabledActions).toHaveCount(3);
  expect(
    await disabledActions.evaluateAll(buttons =>
      buttons.map(button => button.getAttribute('title') ?? ''),
    ),
  ).toEqual([
    expect.stringContaining(NOTICE_FRAGMENT),
    expect.stringContaining(NOTICE_FRAGMENT),
    expect.stringContaining(NOTICE_FRAGMENT),
  ]);

  // 刻意不挡预览：受限只是「不给分享入口 + 明确提示」，不是安全边界。
  await item.locator('.item-name').click();
  await expect(page.locator('.modal-overlay')).toBeVisible();
  await expect(page.locator('.modal-body')).toContainText(PREVIEW_BODY);

  const footerActions = page.locator('.preview-footer-actions button');

  await expect(footerActions).toHaveCount(4);
  await expect(footerActions.nth(0)).toBeDisabled();
  await expect(footerActions.nth(1)).toBeDisabled();
  await expect(footerActions.nth(2)).toBeDisabled();
  await expect(footerActions.nth(3)).toBeEnabled();
  await expect(footerActions.nth(0)).toHaveAttribute(
    'title',
    /无法阻止直接访问/,
  );
});

test('deny / allow 命中的节点在目录与搜索里都不出现，未受限邻居正常', async ({
  page,
}) => {
  await installFixture(page);
  await page.goto('/fixture');

  // allow_paths 之外的 other/ 整体消失。
  await expect(page.locator('.file-item')).toHaveCount(3);
  await expect(page.locator('.file-item', { hasText: 'other' })).toHaveCount(0);

  await page.goto('/fixture/allowed');

  // deny_paths 命中的 denied/ 连同子树消失，只剩未受限的 open.txt。
  await expect(page.locator('.file-item')).toHaveCount(1);
  await expect(page.locator('.file-item', { hasText: 'denied' })).toHaveCount(
    0,
  );
  await expect(
    page.locator('.file-item', { hasText: 'open.txt' }),
  ).toBeVisible();
  await expect(page.locator('.item-actions button:disabled')).toHaveCount(0);
  await expect(page.locator('.restricted-indicator')).toHaveCount(0);

  const input = page.locator('.search-box input');

  await input.fill('secret');
  await expect(page.locator('.search-results-header')).toContainText(
    '找到 0 项',
  );

  await input.fill('hidden');
  await expect(page.locator('.search-results-header')).toContainText(
    '找到 0 项',
  );

  await input.fill('open');
  await expect(page.locator('.file-item')).toHaveCount(1);
  await expect(page.locator('.item-path')).toContainText(
    '/fixture/allowed/open.txt',
  );

  // 搜索结果里的受限节点同样带标识。
  await input.fill('restricted-note');
  await expect(page.locator('.file-item')).toHaveCount(1);
  await expect(page.locator('.restricted-indicator')).toBeVisible();
  await expect(page.locator('.item-actions button:disabled')).toHaveCount(3);
});

test('当前目录受限时目录分享入口禁用，未受限目录保持可用', async ({ page }) => {
  await installFixture(page);
  await page.goto('/fixture/restricted-dir');

  await expect(page.locator('.file-item')).toHaveCount(1);

  const shareButton = page.locator('.share-btn');

  await expect(shareButton).toBeVisible();
  await expect(shareButton).toBeDisabled();
  await expect(shareButton).toHaveAttribute('title', /无法阻止直接访问/);

  await page.goto('/fixture/allowed');

  await expect(page.locator('.share-btn')).toBeEnabled();
  await expect(page.locator('.share-btn')).toHaveAttribute(
    'title',
    '分享当前目录',
  );
});

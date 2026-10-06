import { expect, test } from './base';

const ADR_DIR = '/documents/scripts/media_organizer/docs/adr';
const FIRST_FILE = '0003-mo-env-whitelist-loading.md';

async function openAdrDirectory(page: import('@playwright/test').Page) {
  await page.goto(ADR_DIR);
  // 外挂索引合并后会重渲染列表，等数量到位再点击，避免点击落在重渲染瞬间。
  await expect(page.locator('.file-item')).toHaveCount(5);
}

/** 外挂直链走 CDN：用固定内容兜底，避免断言依赖第三方网络。 */
async function routeFirstFile(page: import('@playwright/test').Page) {
  await page.route(`**/${FIRST_FILE}*`, route =>
    route.fulfill({
      status: 200,
      contentType: 'text/markdown',
      headers: { 'access-control-allow-origin': '*' },
      body: '# 深链预览\n\nmo_env 白名单键加载',
    }),
  );
}

test('点击文件写入 ?preview=，Esc 关闭后清理地址并还原焦点', async ({
  page,
}) => {
  await openAdrDirectory(page);

  const card = page.locator('.file-item', { hasText: FIRST_FILE }).first();
  const historyBefore = await page.evaluate(() => window.history.length);

  await card.locator('.item-name').click();

  await expect(page.locator('.modal-overlay')).toBeVisible();
  await expect(page).toHaveURL(/\?preview=/);
  expect(decodeURIComponent(page.url())).toContain(`${ADR_DIR}/${FIRST_FILE}`);

  // 打开时焦点移入弹窗（可访问性）
  await expect(page.locator('.modal-content')).toBeFocused();

  // 打开写入一条历史记录（浏览器后退即可关闭），关闭时只 replace、不再堆记录
  const historyOpen = await page.evaluate(() => window.history.length);

  expect(historyOpen).toBe(historyBefore + 1);

  await page.keyboard.press('Escape');

  await expect(page.locator('.modal-overlay')).toBeHidden();
  await expect(page).not.toHaveURL(/preview=/);
  await expect(card).toBeFocused();
  expect(await page.evaluate(() => window.history.length)).toBe(historyOpen);
});

test('打开预览后按浏览器后退键关闭预览', async ({ page }) => {
  await openAdrDirectory(page);

  await page
    .locator('.file-item', { hasText: FIRST_FILE })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.modal-overlay')).toBeVisible();

  await page.goBack();

  await expect(page.locator('.modal-overlay')).toBeHidden();
  await expect(page).not.toHaveURL(/preview=/);
});

test('Tab 在弹窗内循环，不会跑到后面的列表上', async ({ page }) => {
  await openAdrDirectory(page);

  await page
    .locator('.file-item', { hasText: FIRST_FILE })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.modal-content')).toBeFocused();

  // 焦点在弹窗容器上，Tab 进入第一个可聚焦元素（标题栏下载）
  await page.keyboard.press('Tab');
  await expect(
    page.locator('.preview-icon-btn[title="下载文件"]'),
  ).toBeFocused();

  // 第一个元素 Shift+Tab 回绕到弹窗内最后一个可聚焦元素（页脚最后一个可见按钮）
  await page.keyboard.press('Shift+Tab');
  expect(
    await page.evaluate(
      () => document.activeElement?.closest('.modal-overlay') !== null,
    ),
  ).toBe(true);
  await expect(
    page.locator('.preview-footer button[title="复制 curl 命令"]'),
  ).toBeFocused();
});

test('直接访问 ?preview= 打开预览，刷新后仍然打开', async ({ page }) => {
  const path = `${ADR_DIR}/${FIRST_FILE}`;

  await routeFirstFile(page);

  await page.goto(`${ADR_DIR}?preview=${encodeURIComponent(path)}`);

  await expect(page.locator('.modal-overlay')).toBeVisible();
  await expect(page.locator('.modal-title')).toHaveText(FIRST_FILE);
  await expect(page.locator('.modal-body .rendered-markdown')).toContainText(
    'mo_env',
  );

  await page.reload();

  await expect(page.locator('.modal-overlay')).toBeVisible();
  await expect(page.locator('.modal-title')).toHaveText(FIRST_FILE);
});

test('?path= 与 ?preview= 同时出现时先定目录再打开文件', async ({ page }) => {
  const path = `${ADR_DIR}/${FIRST_FILE}`;

  await routeFirstFile(page);

  await page.goto(
    `/?path=${encodeURIComponent(ADR_DIR)}&preview=${encodeURIComponent(path)}`,
  );

  await expect(page.locator('.breadcrumb .current')).toHaveText('adr');
  await expect(page.locator('.modal-overlay')).toBeVisible();
  await expect(page.locator('.modal-title')).toHaveText(FIRST_FILE);
  await expect(page).toHaveURL(/preview=/);
});

test('?preview= 目标不在索引里时弹窗内显示错误态且可关闭', async ({ page }) => {
  const missing = `${ADR_DIR}/no-such-file.md`;

  await page.goto(`${ADR_DIR}?preview=${encodeURIComponent(missing)}`);

  await expect(page.locator('.modal-overlay')).toBeVisible();
  await expect(page.locator('.modal-body .error')).toContainText(
    '预览目标不存在或已被移除',
  );
  await expect(page.locator('.modal-title')).toHaveText('no-such-file.md');

  await page.keyboard.press('Escape');

  await expect(page.locator('.modal-overlay')).toBeHidden();
  await expect(page).not.toHaveURL(/preview=/);
});

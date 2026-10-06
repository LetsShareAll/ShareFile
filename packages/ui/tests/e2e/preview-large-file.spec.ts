import { expect, test } from './base';

const TARGET_URL = '**/softwares/applications/tools/config.example.yaml*';
const FILLER = 'key: value # 用于构造超过 1 MB 的文本预览内容';

/** 26000 行 ≈ 1.4 MB：同时越过 1 MB 与 2000 行两个上限。 */
const BIG_TEXT = Array.from(
  { length: 26_000 },
  (_, index) => `${index} ${FILLER}`,
).join('\n');

test('超过 1 MB 的文本预览截断，并给出下载 / 新标签打开', async ({ page }) => {
  await page.route(TARGET_URL, route =>
    route.fulfill({
      status: 200,
      contentType: 'text/yaml',
      body: BIG_TEXT,
    }),
  );

  await page.goto('/softwares/applications/tools');
  await expect(page.locator('.file-item')).toHaveCount(6);

  await page
    .locator('.file-item', { hasText: 'config.example.yaml' })
    .first()
    .locator('.item-name')
    .click();

  const notice = page.locator('.preview-truncation');

  await expect(notice).toBeVisible();
  await expect(notice).toContainText('已显示前 2000 行');
  await expect(notice.locator('button', { hasText: '下载' })).toBeVisible();
  await expect(
    notice.locator('button', { hasText: '新标签打开' }),
  ).toBeVisible();

  // 只渲染前 2000 行，没有「仍要加载完整内容」入口
  await expect(page.locator('.code-preview-line')).toHaveCount(2000);
  await expect(page.locator('.modal-body')).not.toContainText('加载完整');
});

test('小文件不显示截断提示', async ({ page }) => {
  // 外挂直链走 CDN，用固定内容兜底，避免断言依赖第三方网络。
  await page.route('**/0001-update-cache-arity-and-mode-contract.md*', route =>
    route.fulfill({
      status: 200,
      contentType: 'text/markdown',
      headers: { 'access-control-allow-origin': '*' },
      body: '# 小文件\n\n没有截断提示',
    }),
  );

  await page.goto('/documents/scripts/media_organizer/docs/adr');
  await expect(page.locator('.file-item')).toHaveCount(5);

  await page
    .locator('.file-item', {
      hasText: '0001-update-cache-arity-and-mode-contract.md',
    })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.modal-body .rendered-markdown')).toBeVisible();
  await expect(page.locator('.preview-truncation')).toHaveCount(0);
});

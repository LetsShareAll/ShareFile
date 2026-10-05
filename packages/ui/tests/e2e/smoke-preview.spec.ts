import { expect, test } from '@playwright/test';
/**
 * 外挂索引在导航后才异步合并，列表会重渲染一次；
 * 直接点击可能落在重渲染的瞬间，导致点击丢失。
 */
async function openDirectory(
  page: import('@playwright/test').Page,
  path: string,
): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.file-item').first()).toBeVisible();
}


test('点击代码文件打开预览并高亮', async ({ page }) => {
  await page.goto('/documents/scripts');

  await page
    .locator('.file-item', { hasText: 'cloudflare-worker.js' })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.modal-overlay')).toBeVisible();
  await expect(page.locator('.modal-body .code-preview')).toBeVisible();
  await expect(page.locator('.modal-body .code-preview')).toContainText(
    'addEventListener',
  );
});

test('点击 Markdown 文件渲染为 HTML', async ({ page }) => {
  await openDirectory(page, '/documents/scripts/media_organizer/docs/adr');

  // 该目录共 5 个 ADR，数量到位说明合并已完成。
  await expect(page.locator('.file-item')).toHaveCount(5);

  await page
    .locator('.file-item', { hasText: '0002-dry-run-zero-side-effects.md' })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.modal-body .rendered-markdown')).toContainText(
    'dry-run 零持久化副作用契约',
  );
});

test('点击图片文件渲染为 img 并可用 Esc 关闭', async ({ page }) => {
  await page.goto('/pictures');

  await page
    .locator('.file-item', { hasText: 'archive.jpg' })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.modal-body img')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toBeHidden();
});

test('点击文本文件渲染为纯文本预览', async ({ page }) => {
  await openDirectory(page, '/pictures/wallpapers/pixiv/武装直升机-122604995');

  await page
    // 同一前缀下有 .jpg 同名文件，用唯一后缀锁定文本文件
    .locator('.file-item', { hasText: '简介.txt' })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.modal-body .rendered-markdown')).toContainText(
    '哥伦比亚',
  );
});

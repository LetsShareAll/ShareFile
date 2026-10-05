import { expect, test } from '@playwright/test';

test('点击代码文件打开预览并高亮', async ({ page }) => {
  await page.goto('/documents/scripts');

  await page
    .locator('.file-item', { hasText: 'cloudflare-worker.js' })
    .first()
    .click();

  await expect(page.locator('.modal-overlay')).toBeVisible();
  await expect(page.locator('.modal-body .code-preview')).toBeVisible();
  await expect(page.locator('.modal-body .code-preview')).toContainText(
    'addEventListener',
  );
});

test('点击 Markdown 文件渲染为 HTML', async ({ page }) => {
  await page.goto('/documents/scripts/media_organizer/docs/adr');

  await page
    .locator('.file-item', { hasText: '0002-dry-run-zero-side-effects.md' })
    .first()
    .click();

  await expect(page.locator('.modal-body .rendered-markdown')).toContainText(
    'dry-run 零持久化副作用契约',
  );
});

test('点击图片文件渲染为 img 并可用 Esc 关闭', async ({ page }) => {
  await page.goto('/pictures');

  await page.locator('.file-item', { hasText: 'archive.jpg' }).first().click();

  await expect(page.locator('.modal-body img')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toBeHidden();
});

import { expect, test } from '@playwright/test';

test('首页渲染目录列表与外壳', async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');

  await expect(page.locator('h1')).toContainText('一起分享吧！文件！');
  await expect(page.locator('.breadcrumb')).toContainText('root');
  await expect(page.locator('.file-item')).toHaveCount(6);
  await expect(page.locator('.search-box input')).toHaveAttribute(
    'placeholder',
    '搜索文件',
  );
  expect(consoleErrors).toEqual([]);
});

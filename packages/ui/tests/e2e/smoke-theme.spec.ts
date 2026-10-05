import { expect, test } from '@playwright/test';

test('主题切换写入 data-theme 并在刷新后保持', async ({ page }) => {
  await page.goto('/');

  await page.locator('.theme-switch button[title="深色模式"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.locator('.theme-switch button[title="浅色模式"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.locator('.theme-switch button[title="自动深色模式"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'auto');
});

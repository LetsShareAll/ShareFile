import { expect, test } from '@playwright/test';

test('搜索命中并可用 Esc 清空', async ({ page }) => {
  await page.goto('/');

  const input = page.locator('.search-box input');

  await input.fill('generate');

  await expect(page.locator('.search-results-header')).toContainText(
    '搜索 "generate"，找到 2 项',
  );
  await expect(page.locator('.file-item')).toHaveCount(2);
  await expect(page.locator('.item-path').first()).toContainText(
    '/softwares/applications/tools/',
  );

  await input.press('Escape');

  await expect(input).toHaveValue('');
  await expect(page.locator('.file-item')).toHaveCount(6);
});

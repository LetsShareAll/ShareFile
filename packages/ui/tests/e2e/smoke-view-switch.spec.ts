import { expect, test } from './base';

test('图标/详情视图切换并在刷新后保持', async ({ page }) => {
  await page.goto('/');

  const container = page.locator('.container');

  await expect(container).toHaveClass(/view-icon/);

  await page.locator('.view-switch button[title="详细信息模式"]').click();
  await expect(container).toHaveClass(/view-detail/);

  await page.reload();
  await expect(page.locator('.container')).toHaveClass(/view-detail/);

  await page.locator('.view-switch button[title="大图标模式"]').click();
  await expect(page.locator('.container')).toHaveClass(/view-icon/);
});

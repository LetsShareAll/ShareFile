import { expect, test } from './base';

test('进入子目录并可经面包屑返回', async ({ page }) => {
  await page.goto('/');

  await page.locator('.file-item', { hasText: 'softwares' }).first().click();

  await expect(page).toHaveURL(/\/softwares$/);
  await expect(page.locator('.breadcrumb .current')).toHaveText('softwares');

  await page.getByRole('link', { name: 'root' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.file-item')).toHaveCount(6);
});

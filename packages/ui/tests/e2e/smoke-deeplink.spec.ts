import { expect, test } from './base';

test('深链直达目录并标记外部节点', async ({ page }) => {
  await page.goto('/softwares/applications/tools');

  await expect(page.locator('.breadcrumb .current')).toHaveText('tools');
  await expect(page.locator('.file-item')).toHaveCount(6);
  await expect(page.locator('.file-item', { hasText: 'FFmpeg' })).toHaveCount(
    1,
  );
});

test('未知路径显示错误空态', async ({ page }) => {
  await page.goto('/no/such/path');

  await expect(page.locator('.empty')).toContainText('该路径不存在或已被移除');
  await expect(page.locator('.file-item')).toHaveCount(0);
});

test('?path= 链接被收敛为 clean URL', async ({ page }) => {
  await page.goto('/?path=/softwares/applications');

  await expect(page).toHaveURL(/\/softwares\/applications$/);
  await expect(page.locator('.breadcrumb .current')).toHaveText('applications');
});

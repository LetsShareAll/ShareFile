import { expect, test } from './base';

test('404.html 写入的待恢复路由在启动时被还原并清理', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => {
    sessionStorage.setItem(
      'share-file:pending-route',
      '/softwares/applications/tools',
    );
  });

  await page.goto('/');

  await expect(page).toHaveURL(/\/softwares\/applications\/tools$/);
  await expect(page.locator('.breadcrumb .current')).toHaveText('tools');

  const pendingRoute = await page.evaluate(() =>
    sessionStorage.getItem('share-file:pending-route'),
  );

  expect(pendingRoute).toBeNull();
});

test('站内物理文件深链直接返回字节（可被 curl 取用）', async ({ request }) => {
  const response = await request.get(
    '/softwares/applications/tools/config.example.yaml',
  );

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('generate_info');
});

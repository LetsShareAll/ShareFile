import { expect, test as setup } from './base';

/**
 * 预热：首次加载会去 CDN 拉外挂索引（12h 缓存在 localStorage）。
 * 把预热后的 storageState 交给后续用例复用，避免每条用例都重新拉一次
 * ——那是之前整套冒烟随机超时的根因。
 */
setup('预热索引与外挂缓存', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.file-item')).toHaveCount(6);
  await expect(page.locator('.external-item').first()).toBeVisible();

  await page.context().storageState({ path: '.tmp/e2e-storage.json' });
});

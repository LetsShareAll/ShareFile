import { expect, test } from './base';

test('外挂挂载合并出标记，刷新后条目保持一致', async ({ page }) => {
  await page.goto('/');

  const items = page.locator('.file-item');
  const externalItems = page.locator('.file-item.external-item');
  const indicators = page.locator('.external-indicator');

  // 先等外挂源合并完成，再拍快照，否则拿到的是只有本地节点的中间态。
  await expect(items).toHaveCount(6);

  const before = await items.allInnerTexts();
  expect(await externalItems.count()).toBeGreaterThanOrEqual(5);
  expect(await indicators.count()).toBeGreaterThanOrEqual(5);

  const refreshButton = page.locator('.refresh-btn');

  await expect(refreshButton).toBeVisible();
  await refreshButton.click();
  await expect(refreshButton).toBeEnabled({ timeout: 30_000 });

  await expect(items).toHaveCount(6);
  expect(await items.allInnerTexts()).toEqual(before);
});

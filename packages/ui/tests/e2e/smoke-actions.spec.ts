import { expect, test } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('复制直链与 curl 命令写入剪贴板', async ({ page }) => {
  await page.goto('/softwares/applications/tools');

  await expect(page.locator('.file-item')).toHaveCount(6);

  const card = page
    .locator('.file-item', { hasText: 'config.example.yaml' })
    .first();

  await card.locator('.item-name').hover();
  await card.locator('button[title="复制直链"]').click();

  const directLink = await page.evaluate(() => navigator.clipboard.readText());

  expect(directLink).toContain(
    '/softwares/applications/tools/config.example.yaml',
  );

  await card.locator('button[title="复制 curl 命令"]').click();

  const curl = await page.evaluate(() => navigator.clipboard.readText());

  expect(curl).toBe(`curl -L -O '${directLink}'`);
});

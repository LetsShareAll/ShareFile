import { expect, test } from './base';

const ADR_DIR = '/documents/scripts/media_organizer/docs/adr';

async function listNames(
  page: import('@playwright/test').Page,
): Promise<string[]> {
  return page.locator('.file-item .item-name-text').allTextContents();
}

async function openFile(page: import('@playwright/test').Page, name: string) {
  await page
    .locator('.file-item', { hasText: name })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.modal-title')).toHaveText(name);
}

test('←/→ 按当前列表顺序切换文件，边界停住', async ({ page }) => {
  await page.goto(ADR_DIR);
  await expect(page.locator('.file-item')).toHaveCount(5);

  const names = await listNames(page);
  const last = names[names.length - 1];

  await openFile(page, names[0]);

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.modal-title')).toHaveText(names[1]);

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.modal-title')).toHaveText(names[2]);

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.modal-title')).toHaveText(names[1]);

  // 边界：第一个文件继续按左，停在原地
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.modal-title')).toHaveText(names[0]);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.modal-title')).toHaveText(names[0]);

  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toBeHidden();

  // 边界：最后一个文件按右，停在原地
  await openFile(page, last);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.modal-title')).toHaveText(last);
});

test('切换排序后导航顺序跟随列表顺序', async ({ page }) => {
  await page.goto(ADR_DIR);
  await expect(page.locator('.file-item')).toHaveCount(5);

  const defaultOrder = await listNames(page);

  await page.evaluate(() => localStorage.setItem('sort', 'size:desc'));
  await page.reload();
  await expect(page.locator('.file-item')).toHaveCount(5);

  const sortedOrder = await listNames(page);

  expect(sortedOrder).not.toEqual(defaultOrder);

  await openFile(page, sortedOrder[0]);

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.modal-title')).toHaveText(sortedOrder[1]);

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.modal-title')).toHaveText(sortedOrder[0]);
});

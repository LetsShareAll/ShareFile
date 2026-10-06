import { expect, test } from './base';

const TOOLS_PATH = '/softwares/applications/tools';

async function openTools(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(TOOLS_PATH);
  await expect(page.locator('.file-item')).toHaveCount(6);
}

test('按名称排序：升序/降序可切换', async ({ page }) => {
  await openTools(page);

  const firstName = page.locator('.file-item .item-name').first();

  await page.locator('.sort-select').selectOption('name');
  await expect(firstName).toHaveText('config.example.yaml');

  await page.locator('.sort-direction').click();
  await expect(firstName).toHaveText('OpenCore-AMR.tar.gz');
});

test('按大小排序：默认降序、未知大小恒在最后，切换后升序', async ({ page }) => {
  await openTools(page);

  const names = page.locator('.file-item .item-name');

  await page.locator('.sort-select').selectOption('size');

  // generate-info-linux 比 generate-share-file-linux 大 744 字节
  await expect(names.first()).toHaveText('generate-info-linux');
  await expect(names.last()).toHaveText('FFmpeg.tar.gz');

  await page.locator('.sort-direction').click();

  await expect(names.first()).toHaveText('config.example.yaml');
  await expect(names.last()).toHaveText('FFmpeg.tar.gz');
});

test('排序偏好写入 localStorage 并在刷新后保持', async ({ page }) => {
  await openTools(page);

  await page.locator('.sort-select').selectOption('created');
  await page.locator('.sort-direction').click();

  expect(await page.evaluate(() => localStorage.getItem('sort'))).toBe(
    'created:asc',
  );

  await page.reload();

  await expect(page.locator('.sort-select')).toHaveValue('created');
  await expect(page.locator('.sort-direction')).toHaveAttribute(
    'aria-label',
    '当前升序',
  );
});

test('文件夹在任意排序下都排在最前', async ({ page }) => {
  // /pictures 下既有文件夹（covers）也有文件，适合验证文件夹优先。
  await page.goto('/pictures');

  await page.locator('.sort-select').selectOption('name');
  await page.locator('.sort-direction').click();

  // 名称降序下文件会排在文件夹名之前，但文件夹优先应使其仍在最前。
  await expect(page.locator('.file-item').first()).toHaveClass(/item-folder/);
  await expect(
    page.locator('.file-item .item-path, .file-item .item-name').first(),
  ).not.toHaveText(/^$/);
});

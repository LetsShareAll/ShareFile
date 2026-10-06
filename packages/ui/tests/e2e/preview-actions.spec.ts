import { expect, test } from './base';

const ADR_DIR = '/documents/scripts/media_organizer/docs/adr';
const FIRST_FILE = '0003-mo-env-whitelist-loading.md';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function openFirstAdrFile(page: import('@playwright/test').Page) {
  await page.goto(ADR_DIR);
  await expect(page.locator('.file-item')).toHaveCount(5);

  await page
    .locator('.file-item', { hasText: FIRST_FILE })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.preview-footer')).toBeVisible();
}

test('页脚复制直链 / 页面链接 / curl 命令并给出已复制反馈', async ({
  page,
}) => {
  await openFirstAdrFile(page);

  const footer = page.locator('.preview-footer');
  const directButton = footer.locator('button[title="复制直链"]');

  await directButton.click();
  await expect(directButton).toHaveText('已复制');

  const direct = await page.evaluate(() => navigator.clipboard.readText());

  expect(direct).toContain(FIRST_FILE);

  await footer.locator('button[title="复制页面链接"]').click();

  const pageLink = await page.evaluate(() => navigator.clipboard.readText());

  expect(pageLink).toContain('path=');
  expect(pageLink).toContain(encodeURIComponent(`${ADR_DIR}/${FIRST_FILE}`));

  await footer.locator('button[title="复制 curl 命令"]').click();

  const curl = await page.evaluate(() => navigator.clipboard.readText());

  expect(curl).toBe(`curl -L -O '${direct}'`);
});

test('哈希默认折叠，展开后可复制', async ({ page }) => {
  await openFirstAdrFile(page);

  const footer = page.locator('.preview-footer');
  const toggle = footer.locator('.preview-hash-toggle');

  await expect(toggle).toBeVisible();
  await expect(footer.locator('.preview-hash-row')).toHaveCount(0);

  await toggle.click();

  await expect(footer.locator('.preview-hash-row')).toHaveCount(2);

  const md5Row = footer.locator('.preview-hash-row', { hasText: 'MD5' });

  await expect(md5Row.locator('code')).toHaveText(/^[0-9a-f]{32}$/);

  await md5Row.locator('button').click();
  await expect(md5Row.locator('button')).toHaveText('已复制');

  const md5 = await page.evaluate(() => navigator.clipboard.readText());

  expect(md5).toMatch(/^[0-9a-f]{32}$/);
});

test('标题栏新标签打开预览中的文件', async ({ page, context }) => {
  await page.goto('/softwares/applications/tools');
  await expect(page.locator('.file-item')).toHaveCount(6);

  await page
    .locator('.file-item', { hasText: 'config.example.yaml' })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.modal-title')).toHaveText('config.example.yaml');

  // 下载按钮的行为取决于直链是否跨域（生产索引里本地文件也是 CDN 绝对地址，
  // 跨域时 download 属性会被忽略、改为开新标签），所以这里只断言与模式无关的
  // 「新标签打开」；「同源原地下载 / 跨域新标签」的契约由 tests/download.spec.ts 单测覆盖。
  const pagePromise = context.waitForEvent('page');

  await page.locator('.preview-newtab-btn').click();

  const opened = await pagePromise;

  expect(opened.url()).toContain('config.example.yaml');
  await opened.close();
});

test('窄屏：标题栏只留下载，其余收进页脚且元信息精简', async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 800 });
  await openFirstAdrFile(page);

  await expect(
    page.locator('.preview-icon-btn[title="下载文件"]'),
  ).toBeVisible();
  await expect(page.locator('.preview-newtab-btn')).toBeHidden();
  await expect(page.locator('.preview-footer-newtab')).toBeVisible();

  const meta = page.locator('.preview-footer-meta');

  await expect(meta).toContainText('更新');
  await expect(meta.locator('.preview-meta-source')).toBeHidden();
  await expect(meta.locator('.preview-hash-toggle')).toBeVisible();
});

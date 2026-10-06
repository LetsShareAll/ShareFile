import { expect, test } from './base';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const TOOLS_PATH = '/softwares/applications/tools';
const FILE_PATH = `${TOOLS_PATH}/config.example.yaml`;
const SHARE_BUTTON = 'button[aria-label="分享当前目录"]';
const POPOVER = '.share-popover';

type Page = import('@playwright/test').Page;

async function openShareMenu(page: Page): Promise<void> {
  await page.goto(TOOLS_PATH);
  await expect(page.locator('.file-item')).toHaveCount(6);
  await page.locator(SHARE_BUTTON).click();
  await expect(page.locator(POPOVER)).toBeVisible();
}

function shareAction(page: Page, name: string) {
  return page.locator(POPOVER).getByRole('menuitem', { name });
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

test('目录分享：复制页面链接得到当前目录的 clean URL', async ({ page }) => {
  await openShareMenu(page);
  await shareAction(page, '复制页面链接').click();

  const origin = new URL(page.url()).origin;

  expect(await readClipboard(page)).toBe(`${origin}${TOOLS_PATH}`);
  await expect(shareAction(page, '已复制')).toBeVisible();
});

test('目录分享：复制直链清单命令按当前目录筛选', async ({ page }) => {
  await openShareMenu(page);

  // 目录没有字节，不提供下载示例。
  await expect(shareAction(page, '复制 curl 下载示例')).toHaveCount(0);

  await shareAction(page, '复制直链清单命令').click();

  const command = await readClipboard(page);

  expect(command.startsWith('curl -sS ')).toBe(true);
  expect(command).toContain('/assets/data/files.jsonl');
  expect(command).toContain(`grep '"path":"${TOOLS_PATH}/'`);
});

test('目录分享：Esc 与点击浮层外部都能关闭', async ({ page }) => {
  await openShareMenu(page);

  await page.keyboard.press('Escape');
  await expect(page.locator(POPOVER)).toHaveCount(0);

  await page.locator(SHARE_BUTTON).click();
  await expect(page.locator(POPOVER)).toBeVisible();

  await page.locator('main').click({ position: { x: 40, y: 120 } });
  await expect(page.locator(POPOVER)).toHaveCount(0);
});

test('目录分享：未知路径不显示分享入口', async ({ page }) => {
  await page.goto('/no/such/path');

  await expect(page.locator('.empty')).toContainText('该路径不存在或已被移除');
  await expect(page.locator(SHARE_BUTTON)).toHaveCount(0);
});

test('目录分享：只有文件深链才提供 curl 下载示例', async ({ page }) => {
  // 站内物理文件由静态服务直接返回，路径不带 `?path=` 时根本不会启动 SPA；
  // 这里用旧深链进入，由前端收敛为 clean URL 后落到文件下载态。
  await page.goto(`/?path=${FILE_PATH}`);
  await expect(page).toHaveURL(new RegExp(`${FILE_PATH}$`));
  await expect(page.locator('.direct-download-state')).toBeVisible();

  // 深链会顺带弹出该文件的预览，先关掉再操作工具栏。
  await expect(page.locator('.modal-overlay.show')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay.show')).toHaveCount(0);

  await page.locator(SHARE_BUTTON).click();
  await expect(page.locator(POPOVER)).toBeVisible();

  await shareAction(page, '复制 curl 下载示例').click();

  const origin = new URL(page.url()).origin;

  expect(await readClipboard(page)).toBe(`curl -L -O '${origin}${FILE_PATH}'`);
});

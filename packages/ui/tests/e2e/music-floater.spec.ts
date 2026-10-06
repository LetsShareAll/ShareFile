import type { Locator, Page } from '@playwright/test';

import { expect, test } from './base';

/** 外挂索引里的 /music 目录：3 个 flac，足够验证队列与切歌。 */
const MUSIC_DIR = '/music';
const AUDIO_COUNT = 3;
const FIRST_TRACK = '在银河中孤独摇摆';

/**
 * 真实 flac 单曲 36–53 MB，而外挂 CDN 对大文件限速 2–36 KB/s：
 * 直接拉真字节会在 45s 用例预算内加载不完。这里只替换「音频字节」，
 * URL 仍由应用自身的 CDN 逻辑生成（产品决策不变）。
 */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const dataSize = rate * seconds;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, Buffer.alloc(dataSize, 128)]);
}

test.beforeEach(async ({ page }) => {
  const body = silentWav(120);

  await page.route('**/music/*.flac', route =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body }),
  );
});

/** 打开目录里的第一首音频：预览弹窗会把队列交给全局悬浮播放器。 */
async function openFirstTrack(page: Page): Promise<void> {
  await page.goto(MUSIC_DIR);

  const items = page.locator('.file-item');

  await expect(items).toHaveCount(AUDIO_COUNT);

  await items
    .filter({ hasText: FIRST_TRACK })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.music-bar')).toBeVisible();
}

function bar(page: Page): Locator {
  return page.locator('.music-bar');
}

function card(page: Page): Locator {
  return page.locator('.music-bar-card');
}

function handle(page: Page): Locator {
  return page.locator('.music-floater-handle');
}

async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();

  if (!box) throw new Error('元素没有可见盒子');

  return box;
}

async function readStored(
  page: Page,
): Promise<{ x: number; y: number; docked: string | null }> {
  const raw = await page.evaluate(() =>
    window.localStorage.getItem('music-floater'),
  );

  expect(raw).not.toBeNull();

  return JSON.parse(raw ?? '{}') as {
    x: number;
    y: number;
    docked: string | null;
  };
}

/**
 * 按住卡片标题行的空白处拖到右边缘松手。
 * 松手瞬间指针还在把手上（会立即 hover 展开），所以先把指针挪走再断言收起态。
 */
async function dragToRightEdge(page: Page): Promise<void> {
  const box = await boxOf(card(page));
  const right = (await page.evaluate(() => window.innerWidth)) - 10;

  await page.mouse.move(box.x + 24, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 56, { steps: 10 });
  await page.mouse.move(right, box.y + 40, { steps: 12 });
  await page.mouse.up();
  await page.mouse.move(640, 320, { steps: 6 });
}

test('打开音频后出现悬浮卡，不再是全宽底栏', async ({ page }) => {
  await openFirstTrack(page);

  await expect(bar(page)).toHaveAttribute('data-playing', 'true');
  await expect(bar(page)).not.toHaveAttribute('data-docked', /.+/);
  await expect(card(page).locator('.music-bar-title')).toContainText(
    FIRST_TRACK,
  );

  const box = await boxOf(card(page));

  expect(box.width).toBeLessThan(500);
  expect(box.width).toBeGreaterThanOrEqual(320);
  expect(box.x).toBeGreaterThan(0);
  await expect(card(page).getByLabel('播放进度')).toBeVisible();
});

test('拖到右边缘后收起为贴边把手', async ({ page }) => {
  await openFirstTrack(page);

  await dragToRightEdge(page);

  await expect(bar(page)).toHaveAttribute('data-docked', 'right');
  await expect(handle(page)).toBeVisible();
  await expect(card(page)).toBeHidden();

  // 把手只剩封面 + 播放状态角标（播放中显示暂停图标）。
  await expect(handle(page).locator('.music-bar-artwork')).toBeAttached();
  await expect(handle(page).locator('.music-floater-badge i')).toHaveClass(
    /fa-pause/,
  );
  await expect(handle(page)).toHaveAttribute('aria-label', /停靠在右侧/);

  const box = await boxOf(handle(page));
  const width = await page.evaluate(() => window.innerWidth);

  expect(Math.round(box.x + box.width)).toBe(width);
});

test('悬停把手弹出完整卡片，移开后收回', async ({ page }) => {
  await openFirstTrack(page);
  await dragToRightEdge(page);

  await expect(card(page)).toBeHidden();

  const box = await boxOf(handle(page));

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 4,
  });

  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('.music-bar-title')).toContainText(
    FIRST_TRACK,
  );

  // 回车 / 空格可用：把手是按钮，展开状态写在 aria-expanded 上。
  await expect(handle(page)).toHaveAttribute('aria-expanded', 'true');

  await page.mouse.move(360, 240, { steps: 6 });

  await expect(card(page)).toBeHidden();
  await expect(handle(page)).toHaveAttribute('aria-expanded', 'false');
});

test('清空队列后悬浮卡与把手一起消失', async ({ page }) => {
  await openFirstTrack(page);
  await dragToRightEdge(page);
  await expect(handle(page)).toBeVisible();

  // 收起态下完整卡片不可见，先悬停把手把它滑出来。
  const box = await boxOf(handle(page));

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 4,
  });
  await expect(card(page)).toBeVisible();

  await card(page).getByLabel('展开播放面板').click();

  const panel = page.locator('.music-panel');

  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '清空队列' }).click();

  await expect(bar(page)).toBeHidden();
  await expect(handle(page)).toHaveCount(0);
});

test('刷新后从 localStorage 恢复停靠状态与位置', async ({ page }) => {
  await openFirstTrack(page);
  await dragToRightEdge(page);

  const saved = await readStored(page);

  expect(saved.docked).toBe('right');

  await page.reload();

  await expect(handle(page)).toBeVisible();
  await expect(bar(page)).toHaveAttribute('data-docked', 'right');

  const box = await boxOf(handle(page));
  const width = await page.evaluate(() => window.innerWidth);

  expect(Math.round(box.x + box.width)).toBe(width);
  expect(Math.abs(box.y - saved.y)).toBeLessThan(2);
});

test('刷新后恢复自由悬浮的位置', async ({ page }) => {
  await openFirstTrack(page);

  const start = await boxOf(card(page));

  await page.mouse.move(start.x + 24, start.y + 12);
  await page.mouse.down();
  await page.mouse.move(520, 260, { steps: 12 });
  await page.mouse.up();

  await expect(bar(page)).not.toHaveAttribute('data-docked', /.+/);

  const saved = await readStored(page);
  const moved = await boxOf(card(page));

  expect(Math.abs(moved.x - saved.x)).toBeLessThan(2);
  expect(Math.abs(moved.y - saved.y)).toBeLessThan(2);

  await page.reload();

  await expect(card(page)).toBeVisible();

  const restored = await boxOf(card(page));

  expect(Math.abs(restored.x - saved.x)).toBeLessThan(2);
  expect(Math.abs(restored.y - saved.y)).toBeLessThan(2);
});

test('按在按钮与进度条上不会拖走卡片', async ({ page }) => {
  await openFirstTrack(page);

  const before = await boxOf(card(page));
  const play = await boxOf(card(page).locator('.music-bar-play'));

  await page.mouse.move(play.x + play.width / 2, play.y + play.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x - 200, before.y - 200, { steps: 10 });
  await page.mouse.up();

  const afterButton = await boxOf(card(page));

  expect(Math.abs(afterButton.x - before.x)).toBeLessThan(1);
  expect(Math.abs(afterButton.y - before.y)).toBeLessThan(1);

  const seek = await boxOf(card(page).getByLabel('播放进度'));

  await page.mouse.move(seek.x + seek.width / 2, seek.y + seek.height / 2);
  await page.mouse.down();
  await page.mouse.move(seek.x - 220, seek.y + 120, { steps: 10 });
  await page.mouse.up();

  const afterSeek = await boxOf(card(page));

  expect(Math.abs(afterSeek.x - afterButton.x)).toBeLessThan(1);
  expect(Math.abs(afterSeek.y - afterButton.y)).toBeLessThan(1);
  await expect(bar(page)).not.toHaveAttribute('data-docked', /.+/);
});

test('拖到左边缘后贴左边收起把手', async ({ page }) => {
  await openFirstTrack(page);

  const box = await boxOf(card(page));

  await page.mouse.move(box.x + 24, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x - 300, box.y + 60, { steps: 10 });
  await page.mouse.move(8, box.y + 40, { steps: 12 });
  await page.mouse.up();
  await page.mouse.move(640, 320, { steps: 6 });

  await expect(bar(page)).toHaveAttribute('data-docked', 'left');
  await expect(handle(page)).toBeVisible();
  await expect(card(page)).toBeHidden();

  const collapsed = await boxOf(handle(page));

  expect(Math.round(collapsed.x)).toBe(0);

  await page.mouse.move(
    collapsed.x + collapsed.width / 2,
    collapsed.y + collapsed.height / 2,
    { steps: 4 },
  );

  await expect(card(page)).toBeVisible();
  // 滑出是 0.24s 的位移动画，等它落地再量。
  await expect
    .poll(async () => Math.round((await boxOf(card(page))).x))
    .toBe(0);
});

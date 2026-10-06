import type { Page } from '@playwright/test';

import { expect, test } from './base';

/** 外挂索引里的 /music 目录：3 个 flac，够验证队列排序。 */
const MUSIC_DIR = '/music';
const AUDIO_COUNT = 3;
const FIRST_TRACK = '在银河中孤独摇摆';
const THIRD_TRACK = '希望有羽毛和翅膀';

/**
 * 真实 flac 单曲 36–53 MB，而外挂 CDN 对大文件限速 2–36 KB/s：
 * 只替换「音频字节」，URL 仍由应用自身的 CDN 逻辑生成。
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

/** 打开第一首：队列里三首，当前是第一首。 */
async function playFirst(page: Page): Promise<void> {
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

/** 展开面板：队列列表这时才挂载。 */
async function openPanel(page: Page): Promise<void> {
  await playFirst(page);
  await page.locator('.music-bar').getByLabel('展开播放面板').click();
  await expect(page.locator('.music-panel')).toBeVisible();
}

function queueItems(page: Page) {
  return page.locator('.music-panel-queue .music-panel-item');
}

function names(page: Page) {
  return page.locator('.music-panel-queue .music-panel-item-name');
}

function currentName(page: Page) {
  return page.locator(
    '.music-panel-queue .music-panel-item.is-current .music-panel-item-name',
  );
}

function thumbnails(page: Page) {
  return page.locator('.music-panel-queue [data-track-thumb]');
}

/** 夹具是 120 秒的静音 WAV：三项都该显示 2:00。 */
function durations(page: Page) {
  return page.locator('.music-panel-queue [data-track-duration]');
}

function readInfoCache(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('music-info'));
}

test('拖第三项到队首：顺序变化，当前曲目仍是同一首，刷新后保持', async ({
  page,
}) => {
  await openPanel(page);

  const items = queueItems(page);

  await expect(items).toHaveCount(AUDIO_COUNT);
  await expect(names(page)).toHaveCount(AUDIO_COUNT);

  // 外挂索引的目录顺序不保证，断言相对变化。
  const before = await names(page).allTextContents();
  const current = await currentName(page).textContent();

  expect(before).toContain(FIRST_TRACK);
  expect(before).toContain(THIRD_TRACK);

  const handle = items.nth(2).locator('[data-drag-handle]');
  const handleBox = await handle.boundingBox();
  const firstBox = await items.nth(0).boundingBox();

  expect(handleBox).not.toBeNull();
  expect(firstBox).not.toBeNull();

  const x = (handleBox?.x ?? 0) + (handleBox?.width ?? 0) / 2;

  await page.mouse.move(x, (handleBox?.y ?? 0) + (handleBox?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move(x, (firstBox?.y ?? 0) + 2, { steps: 12 });

  // 拖动中的视觉反馈：被拖项与落点提示。
  await expect(items.nth(2)).toHaveClass(/is-dragging/);
  await expect(items.nth(0)).toHaveClass(/is-drop-target/);

  await page.mouse.up();

  // Vue 的 DOM 更新是异步的：用会自动重试的断言等它落定。
  await expect(names(page)).toHaveText([before[2], before[0], before[1]]);

  const after = await names(page).allTextContents();

  // 当前曲目没被拖动影响：仍是同一首，且队列里只有一个当前项。
  await expect(currentName(page)).toHaveText(current ?? '');
  await expect(
    page.locator('.music-panel-queue .music-panel-item.is-current'),
  ).toHaveCount(1);

  // 队列持久化：刷新后顺序保持。
  await page.reload();
  await page.locator('.music-bar').getByLabel('展开播放面板').click();

  await expect(names(page)).toHaveText(after);
});

test('队列项带封面缩略图与时长：时长来自懒解析的音频标签', async ({ page }) => {
  await openPanel(page);

  await expect(queueItems(page)).toHaveCount(AUDIO_COUNT);
  // 无内嵌封面时是 fa-music 占位，但缩略图容器每项都要有。
  await expect(thumbnails(page)).toHaveCount(AUDIO_COUNT);
  await expect(durations(page)).toHaveText(['2:00', '2:00', '2:00']);
});

test('切歌后当前项立即有值：时长与缩略图跟着当前曲目走', async ({ page }) => {
  await openPanel(page);
  await expect(durations(page)).toHaveText(['2:00', '2:00', '2:00']);

  await queueItems(page).nth(1).locator('.music-panel-item-btn').click();

  const current = page.locator(
    '.music-panel-queue .music-panel-item.is-current',
  );

  await expect(current).toHaveCount(1);
  await expect(current.locator('[data-track-duration]')).toHaveText('2:00');
  await expect(current.locator('[data-track-thumb]')).toHaveCount(1);
});

test('面板没打开就不解析：打开后结果落 music-info 缓存且不含封面 blob', async ({
  page,
}) => {
  await playFirst(page);
  // 队列列表还没挂载：一次懒解析都不该发生。
  expect(await readInfoCache(page)).toBeNull();

  await page.locator('.music-bar').getByLabel('展开播放面板').click();
  await expect(page.locator('.music-panel')).toBeVisible();
  await expect(thumbnails(page)).toHaveCount(AUDIO_COUNT);

  // 解析完成后落盘元信息缓存（封面只留在内存，不进 localStorage）。
  await expect.poll(() => readInfoCache(page)).toContain('"duration"');
  expect(await readInfoCache(page)).not.toContain('blob');
});

test('点按拖拽手柄不换位：没有位移就不触发移动', async ({ page }) => {
  await openPanel(page);

  const items = queueItems(page);

  await expect(names(page)).toHaveCount(AUDIO_COUNT);

  const before = await names(page).allTextContents();

  await items.nth(0).locator('[data-drag-handle]').click();

  await expect(names(page)).toHaveText(before);
});

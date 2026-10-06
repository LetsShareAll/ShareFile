import type { Page } from '@playwright/test';

import { expect, test } from './base';

/** 外挂索引里的 /music 目录：3 个 flac，足够验证队列与切歌。 */
const MUSIC_DIR = '/music';
const AUDIO_COUNT = 3;
const FIRST_TRACK = '在银河中孤独摇摆';
const SECOND_TRACK = '使一颗心免于哀伤';

/**
 * 真实 flac 单曲 36–53 MB，而外挂 CDN 对大文件限速 2–36 KB/s：
 * 直接拉真字节会在 45s 用例预算内加载不完，甚至触发媒体 error 让 store 自动跳下一首。
 * 这里只替换「音频字节」，URL 仍由应用自身的 CDN 逻辑生成（产品决策不变）。
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

/** 打开目录里的第一首音频：预览弹窗会把队列交给底部全局播放条。 */
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

function bar(page: Page) {
  return page.locator('.music-bar');
}

test('打开音频文件后底部条出现，标题与队列长度正确', async ({ page }) => {
  await openFirstTrack(page);

  await expect(bar(page).locator('.music-bar-title')).toContainText(
    FIRST_TRACK,
  );

  await bar(page).getByLabel('展开播放面板').click();

  const panel = page.locator('.music-panel');

  await expect(panel).toBeVisible();
  await expect(
    panel.locator('.music-panel-queue .music-panel-item'),
  ).toHaveCount(AUDIO_COUNT);
  await expect(
    panel.locator('.music-panel-queue .music-panel-item.is-current'),
  ).toContainText(FIRST_TRACK);
});

test('下一首切换曲目，面板当前项高亮随之移动', async ({ page }) => {
  await openFirstTrack(page);

  await expect(bar(page).locator('.music-bar-title')).toContainText(
    FIRST_TRACK,
  );

  await bar(page).getByLabel('下一首').click();

  await expect(bar(page).locator('.music-bar-title')).toContainText(
    SECOND_TRACK,
  );

  await bar(page).getByLabel('展开播放面板').click();

  await expect(
    page.locator('.music-panel-queue .music-panel-item.is-current'),
  ).toContainText(SECOND_TRACK);
});

test('Esc 关闭预览弹窗后全局播放条仍在', async ({ page }) => {
  await openFirstTrack(page);

  await expect(page.locator('.modal-overlay')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.locator('.modal-overlay')).toBeHidden();
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator('.music-bar-title')).toContainText(
    FIRST_TRACK,
  );
});

test('刷新页面后恢复同一首，且处于暂停态', async ({ page }) => {
  await openFirstTrack(page);

  await expect(bar(page).locator('.music-bar-title')).toContainText(
    FIRST_TRACK,
  );

  await page.reload();

  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator('.music-bar-title')).toContainText(
    FIRST_TRACK,
  );
  await expect(bar(page)).toHaveAttribute('data-playing', 'false');
  await expect(bar(page).getByLabel('播放', { exact: true })).toBeVisible();
});

test('面板展示队列与历史，切歌后历史出现刚才那首', async ({ page }) => {
  await openFirstTrack(page);

  await bar(page).getByLabel('展开播放面板').click();

  const panel = page.locator('.music-panel');

  await expect(panel.locator('.music-panel-queue')).toBeVisible();
  await expect(panel.locator('.music-panel-history')).toBeVisible();

  await panel.getByLabel('下一首').click();

  await expect(bar(page).locator('.music-bar-title')).toContainText(
    SECOND_TRACK,
  );
  await expect(panel.locator('.music-panel-history')).toContainText(
    FIRST_TRACK,
  );
});

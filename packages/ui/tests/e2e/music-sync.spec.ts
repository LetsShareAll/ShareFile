import type { Page } from '@playwright/test';

import { expect, test } from './base';

/** 外挂索引里的 /music 目录：3 个 flac，够验证跨标签页协调。 */
const MUSIC_DIR = '/music';
const AUDIO_COUNT = 3;
const FIRST_TRACK = '在银河中孤独摇摆';

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

async function routeAudio(page: Page): Promise<void> {
  const body = silentWav(120);

  await page.route('**/music/*.flac', route =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body }),
  );
}

function bar(page: Page) {
  return page.locator('.music-bar');
}

/** 第一首播起来，并等到进度确实往前走。 */
async function playFirstTrack(page: Page): Promise<void> {
  await routeAudio(page);
  await page.goto(MUSIC_DIR);

  const items = page.locator('.file-item');

  await expect(items).toHaveCount(AUDIO_COUNT);

  await items
    .filter({ hasText: FIRST_TRACK })
    .first()
    .locator('.item-name')
    .click();

  await expect(bar(page)).toHaveAttribute('data-playing', 'true');
  await expect
    .poll(async () =>
      Number(await bar(page).locator('.music-bar-seek').inputValue()),
    )
    .toBeGreaterThan(1);
}

async function openSecondTab(page: Page): Promise<void> {
  await routeAudio(page);
  // 同一个 context：localStorage 与 BroadcastChannel 都共享，等价于「又开了一个标签页」。
  await page.goto('/');
  await expect(bar(page)).toBeVisible();
}

test('后开的标签页镜像同一首、同一进度，但保持暂停', async ({
  page,
  context,
}) => {
  await playFirstTrack(page);

  const second = await context.newPage();

  await openSecondTab(second);

  await expect(bar(second).locator('.music-bar-title')).toContainText(
    FIRST_TRACK,
  );
  await expect(bar(second)).toHaveAttribute('data-playing', 'false');
  await expect(bar(second).getByLabel('播放', { exact: true })).toBeVisible();

  // 进度对齐到先开那个标签页的位置（不是从 0 开始）。
  const progress = Number(
    await bar(second).locator('.music-bar-seek').inputValue(),
  );

  expect(progress).toBeGreaterThan(1);

  // 先开的标签页不受影响，仍在播。
  await expect(bar(page)).toHaveAttribute('data-playing', 'true');

  await second.close();
});

test('另一个标签页起播后，先前的标签页静音（同一时刻只有一个出声）', async ({
  page,
  context,
}) => {
  await playFirstTrack(page);

  const second = await context.newPage();

  await openSecondTab(second);
  await expect(bar(second)).toHaveAttribute('data-playing', 'false');

  await bar(second).getByLabel('播放', { exact: true }).click();

  await expect(bar(second)).toHaveAttribute('data-playing', 'true');
  await expect(bar(page)).toHaveAttribute('data-playing', 'false');

  // 反向亦然：先开的标签页重新起播，后开的那个必须停下。
  await bar(page).getByLabel('播放', { exact: true }).click();

  await expect(bar(page)).toHaveAttribute('data-playing', 'true');
  await expect(bar(second)).toHaveAttribute('data-playing', 'false');

  await second.close();
});

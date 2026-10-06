import type { Page } from '@playwright/test';

import { expect, test } from './base';

// 剪贴板读写在 headless Chromium 下必须显式授权。
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const MUSIC_DIR = '/music';
const FIRST_TRACK = '在银河中孤独摇摆';

/** 8000 Hz 单声道静音 WAV：体积小，且文件头就写着时长。 */
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

interface ServedFixtures {
  /** 媒体元素（引擎 loadedmetadata 的时长来源）。 */
  media: number;
  /** 元信息解析（标签时长的来源）。 */
  metadata: number;
}

/**
 * 两类请求给不同的夹具：媒体元素拿 1:00，元信息解析拿 2:00。
 * 于是「当前项显示的那一格里是谁的时长」在断言里一目了然：
 * 显示 2:00 只可能来自已解析的标签，而不是引擎。
 */
async function mockAudio(page: Page, served: ServedFixtures): Promise<void> {
  const media = silentWav(60);
  const metadata = silentWav(120);

  await page.route('**/music/*.flac', route => {
    if (route.request().resourceType() === 'media') {
      served.media += 1;

      return route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: media,
      });
    }

    served.metadata += 1;

    return route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      body: metadata,
    });
  });
}

async function playFirst(page: Page): Promise<void> {
  await page.goto(MUSIC_DIR);

  await page
    .locator('.file-item')
    .filter({ hasText: FIRST_TRACK })
    .first()
    .locator('.item-name')
    .click();

  await expect(page.locator('.music-bar')).toBeVisible();
}

async function openPanel(page: Page): Promise<void> {
  await page.locator('.music-bar').getByLabel('展开播放面板').click();
  await expect(page.locator('.music-panel')).toBeVisible();
}

function currentDuration(page: Page) {
  return page.locator(
    '.music-panel-queue .music-panel-item.is-current [data-track-duration]',
  );
}

test('面板打开瞬间当前项就有时长：来自已解析的标签，不等引擎', async ({
  page,
}) => {
  const served: ServedFixtures = { media: 0, metadata: 0 };

  await mockAudio(page, served);
  await playFirst(page);

  // 悬浮卡的总时长也只能是标签那份（引擎的夹具只有 1:00）。
  await expect(page.locator('.music-bar-time.is-total')).toHaveText('2:00');

  await openPanel(page);

  // 第一帧就是 2:00：不再先 --:-- 再跳变，也不会先显示引擎的 1:00。
  expect(await currentDuration(page).textContent()).toBe('2:00');
  await expect(currentDuration(page)).toHaveText('2:00');

  // 两类请求都真的发生了：夹具分流生效，上面的 2:00 不是「碰巧两边一样」。
  expect(served.media).toBeGreaterThan(0);
  expect(served.metadata).toBeGreaterThan(0);
});

test('面板分享：页面链接与 curl 命令写入剪贴板', async ({ page }) => {
  const served: ServedFixtures = { media: 0, metadata: 0 };

  await mockAudio(page, served);
  await playFirst(page);
  await openPanel(page);

  const share = page.locator('.music-panel-share');
  const pageButton = share.getByLabel('复制页面链接');

  await pageButton.click();
  await expect(pageButton).toHaveText(/已复制/);

  const pageUrl = await page.evaluate(() => navigator.clipboard.readText());

  expect(pageUrl).toContain('?path=');
  expect(decodeURIComponent(pageUrl)).toContain(`${MUSIC_DIR}/`);
  expect(pageUrl.startsWith('http://127.0.0.1:4173/')).toBe(true);

  const directButton = share.getByLabel('复制直链');

  await directButton.click();
  await expect(directButton).toHaveText(/已复制/);

  const directUrl = await page.evaluate(() => navigator.clipboard.readText());

  expect(directUrl).toContain('.flac');

  // curl 命令与「复制直链」同源同义，和列表卡片、预览页脚一致。
  await share.getByLabel('复制 curl 命令').click();

  const curl = await page.evaluate(() => navigator.clipboard.readText());

  expect(curl).toBe(`curl -L -O '${directUrl}'`);
});

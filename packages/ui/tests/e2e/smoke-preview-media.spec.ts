import type { Page } from '@playwright/test';

import { expect, test } from './base';

const RAW_BASE =
  'https://raw.githubusercontent.com/LetsShareAll/ShareFile/file';

/**
 * 外挂 CDN 只是同一仓库 raw 上游的代理，但会对大文件限速
 * （实测 2–36 KB/s，2.5 MB 字体远超 15s 断言预算，甚至返回截断响应）。
 * 用例改从上游取夹具字节：内容、content-length 与 CORS 响应头都一致，
 * 页面里被测的仍是同一条 `fileUrl` 请求链路。
 */
async function routeFixture(page: Page, path: string): Promise<void> {
  await page.route(`**/${path}`, async route => {
    const response = await route.fetch({ url: `${RAW_BASE}/${path}` });

    await route.fulfill({ response });
  });
}

/** 从 computed font-family 里取出注入的唯一家族名。 */
function familyOf(value: string): string {
  return value
    .replace(/^["']|["']$/g, '')
    .split(',')[0]
    .trim();
}

test('字体文件显示标本，字号与自定义文字即时生效', async ({ page }) => {
  await routeFixture(page, 'share-file.cdn.json');
  await routeFixture(
    page,
    'others/fonts/truetype/smiley/SmileySans-Oblique.ttf',
  );
  await page.goto('/others/fonts/truetype/smiley');

  const item = page.locator('.file-item', {
    hasText: 'SmileySans-Oblique.ttf',
  });

  await expect(item.first()).toBeVisible();
  await item.first().locator('.item-name').click();

  const specimen = page.locator('.font-preview-specimen');

  await expect(specimen).toBeVisible();
  await expect(specimen).toContainText('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  await expect(specimen).toContainText('春眠不觉晓');
  await expect(page.locator('.font-preview-meta')).toContainText(
    'SmileySans-Oblique.ttf',
  );

  // @font-face 注入成功：document.fonts.check 对唯一家族名返回 true。
  const family = familyOf(
    await specimen.evaluate(el => getComputedStyle(el).fontFamily),
  );

  expect(family).toMatch(/^sf-preview-/);
  expect(
    await page.evaluate(name => document.fonts.check(`1em "${name}"`), family),
  ).toBe(true);
  expect(
    await page.evaluate(
      name =>
        [...document.fonts]
          .filter(face => face.family.replace(/^["']|["']$/g, '') === name)
          .map(face => face.status),
      family,
    ),
  ).toContain('loaded');

  const slider = page.locator('.font-preview-slider');

  await slider.fill('72');
  await expect(specimen).toHaveCSS('font-size', '72px');

  await page.locator('.font-preview-input').fill('自定义样张 ABC 123');
  await expect(specimen).toContainText('自定义样张 ABC 123');
  await expect(specimen).not.toContainText('春眠不觉晓');

  await page.getByRole('button', { name: '恢复默认样张' }).click();
  await expect(specimen).toContainText('春眠不觉晓');
});

test('图片预览支持工具栏缩放、双击复位与拖拽平移', async ({ page }) => {
  await routeFixture(page, 'share-file.cdn.json');
  await routeFixture(page, 'pictures/archive.jpg');
  await page.goto('/pictures');

  await page
    .locator('.file-item', { hasText: 'archive.jpg' })
    .first()
    .locator('.item-name')
    .click();

  const frame = page.locator('.image-preview-frame');
  const target = page.locator('.image-preview-target');
  const percent = page.locator('.image-preview-percent');
  const toolbar = page.locator('.image-preview-toolbar');

  await expect(target).toBeVisible();
  await expect(toolbar).toBeVisible();
  // 256×256 小图：适应窗口不放大，初始即 100%。
  await expect(percent).toHaveText('100%');

  await toolbar.getByLabel('放大').click();
  await expect(percent).toHaveText('125%');
  // 工具栏点击不应冒泡到遮罩关闭弹窗。
  await expect(page.locator('.modal-overlay')).toBeVisible();

  for (let index = 0; index < 4; index += 1) {
    await toolbar.getByLabel('放大').click();
  }

  await expect(percent).toHaveText('305%');

  const box = await frame.boundingBox();
  const before = await target.evaluate(el => el.style.transform);

  if (!box) throw new Error('未取到视框尺寸');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 80, {
    steps: 5,
  });
  await page.mouse.up();

  await expect
    .poll(() => target.evaluate(el => el.style.transform))
    .not.toBe(before);

  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  await expect(percent).toHaveText('100%');
  await expect
    .poll(() => target.evaluate(el => el.style.transform))
    .toBe('translate3d(0px, 0px, 0px) scale(1)');

  await toolbar.getByLabel('缩小').click();
  await expect(percent).toHaveText('80%');

  await toolbar.getByTitle('适应窗口').click();
  await expect(percent).toHaveText('100%');

  // 键盘只接管 + / - / 0，方向键仍归弹窗切换文件。
  await page.keyboard.press('+');
  await expect(percent).toHaveText('125%');
  await page.keyboard.press('0');
  await expect(percent).toHaveText('100%');
});

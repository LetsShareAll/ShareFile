import { expect, test as base } from '@playwright/test';

/**
 * 所有 e2e 用例共用的基础 fixture。
 *
 * 屏蔽第三方字体 CDN：headless 环境本来就拿不到 Font Awesome 字形
 * （`document.fonts.check` 为 false），每次页面加载等它只会拖慢套件并引入随机超时。
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // 用空 200 而不是 abort：abort 会让浏览器记录一条资源加载失败，
    // 而首页用例断言 console 零 error。
    await page.route('**://cdnjs.cloudflare.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );

    await use(page);
  },
});

export { expect };

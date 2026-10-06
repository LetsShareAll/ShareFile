import { expect, test as base } from '@playwright/test';

/**
 * 所有 e2e 用例共用的基础 fixture。
 *
 * 屏蔽第三方字体 CDN：headless 环境本来就拿不到 Font Awesome 字形
 * （`document.fonts.check` 为 false），每次页面加载等它只会拖慢套件并引入随机超时。
 */
const RAW_BASE =
  'https://raw.githubusercontent.com/LetsShareAll/ShareFile/file';

export const test = base.extend({
  page: async ({ page }, use) => {
    // 用空 200 而不是 abort：abort 会让浏览器记录一条资源加载失败，
    // 而首页用例断言 console 零 error。
    await page.route('**://cdnjs.cloudflare.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );

    // 外挂资源（索引、字体等）改走 raw 上游——**仅测试内**。
    // 自有 CDN 是产品选型（国内可达），但它会限速：实测同一份索引在
    // 468 B/s ~ 188 KB/s 之间波动，整套冒烟会因此随机超时。
    // CDN 的路径把上游 host 写在里面：`/raw.githubusercontent.com/<repo>/<branch>/<path>`，
    // 所以上游地址就是 `https://` + 去掉前导斜杠的 pathname（别再拼一次 host）。
    // 只拦自有 CDN 域，绝不碰本地 dev server 提供的 /assets/data/*.json。
    await page.route('**://cdn-file.lssa.fun/**', async route => {
      const { pathname } = new URL(route.request().url());
      const upstream = `https://${pathname.replace(/^\//, '')}`;

      try {
        await route.fulfill({ response: await route.fetch({ url: upstream }) });
      } catch {
        await route.continue();
      }
    });

    await use(page);
  },
});

export { expect };

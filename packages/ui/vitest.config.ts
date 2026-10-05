import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    // 只跑单元测试；tests/e2e/** 归 Playwright
    include: ['tests/*.spec.ts'],
  },
});

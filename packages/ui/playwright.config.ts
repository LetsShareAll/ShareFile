import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },

  // 本地已有 dev server 时直接复用；CI 里先构建再以 preview 起生产产物。
  webServer: {
    command: 'pnpm run build && pnpm run preview',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  base: '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  build: {
    outDir: '/tmp/sf-phase5-probe',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: fileURLToPath(new URL('./probe.ts', import.meta.url)),
    },
  },
});

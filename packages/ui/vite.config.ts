import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const uiRoot = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = fileURLToPath(new URL('../../public', import.meta.url));

const DEV_PORT = Number(process.env.PORT ?? 4173);

export default defineConfig(({ command, mode }) => {
  const useLocalIndex = mode === 'development' || mode === 'local';

  return {
    root: uiRoot,
    base: '/',
    plugins: [vue()],
    // 生产构建的 outDir 就是 public 本身：既不能清空它，也不能把它复制进自己。
    publicDir: command === 'serve' ? publicRoot : false,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('src', import.meta.url)),
      },
    },
    define: {
      __SHARE_FILE_NAME__: JSON.stringify(
        useLocalIndex ? 'share-file.json' : 'share-file.cdn.json',
      ),
    },
    server: {
      host: '127.0.0.1',
      port: DEV_PORT,
      strictPort: true,
    },
    preview: {
      host: '127.0.0.1',
      port: DEV_PORT,
      strictPort: true,
    },
    build: {
      outDir: publicRoot,
      emptyOutDir: false,
      assetsDir: 'assets',
      sourcemap: mode !== 'production',
    },
  };
});

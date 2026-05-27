import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const publicRoot = path.join(repoRoot, 'public');

/**
 * 创建 esbuild 配置
 * @param {Object} options - 配置选项
 * @param {boolean} options.dev - 是否为开发模式
 * @returns {Object} esbuild 配置对象
 */
export function createConfig(options = {}) {
  const isDev = options.dev || false;

  return {
    entryPoints: [path.join(__dirname, '../src/index.ts')],
    bundle: true,
    outfile: path.join(publicRoot, 'assets/scripts/index.js'),
    sourcemap: isDev,
    minify: !isDev,
    define: {
      SHARE_FILE_NAME: isDev ? '"share-file.json"' : '"share-file.cdn.json"',
    },
    logLevel: isDev ? 'info' : 'warning',
  };
}

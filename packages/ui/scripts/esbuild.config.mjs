import path from 'node:path';
import { publicRoot, uiPackageRoot } from './paths.mjs';

/**
 * 创建 esbuild 配置
 * @param {Object} options - 配置选项
 * @param {boolean} options.dev - 是否为开发模式
 * @param {boolean} options.useCdn - 是否使用 CDN 索引数据
 * @returns {Object} esbuild 配置对象
 */
export function createConfig(options = {}) {
  const isDev = options.dev || false;
  const useCdn = options.useCdn ?? !isDev;
  const shareFileName = useCdn ? 'share-file.cdn.json' : 'share-file.json';

  return {
    entryPoints: [path.join(uiPackageRoot, 'src/index.ts')],
    bundle: true,
    outfile: path.join(publicRoot, 'assets/scripts/index.js'),
    sourcemap: isDev,
    minify: !isDev,
    define: {
      SHARE_FILE_NAME: JSON.stringify(shareFileName),
    },
    logLevel: isDev ? 'info' : 'warning',
  };
}

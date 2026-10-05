/**
 * 首屏体积门禁：汇总 public/index.html 直接引用的 JS/CSS（入口 + modulepreload + 样式），
 * 按 gzip 体积判定是否超阈值。默认 250 KB，可用 --max-gzip-kb 覆盖。
 *
 * 用法：node scripts/check-bundle-size.mjs [--max-gzip-kb=250]
 */

import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const publicRoot = path.join(repoRoot, 'public');

const DEFAULT_MAX_GZIP_KB = 250;

function parseMaxGzipKb(argv) {
  const option = argv.find(arg => arg.startsWith('--max-gzip-kb='));

  if (!option) return DEFAULT_MAX_GZIP_KB;

  const value = Number(option.split('=')[1]);

  if (!Number.isFinite(value) || value <= 0) {
    console.error(`无效的 --max-gzip-kb 取值: ${option}`);
    process.exit(2);
  }

  return value;
}

function collectAssetRefs(html) {
  const refs = new Set();
  const patterns = [/<script[^>]+src="([^"]+)"/g, /<link[^>]+href="([^"]+)"/g];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const ref = match[1];

      if (ref.startsWith('/assets/')) refs.add(ref);
    }
  }

  return [...refs].sort();
}

async function measure(ref) {
  const filePath = path.join(publicRoot, ref.replace(/^\//, ''));
  const content = await readFile(filePath);

  return {
    ref,
    rawBytes: content.byteLength,
    gzipBytes: gzipSync(content).byteLength,
  };
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

const maxGzipKb = parseMaxGzipKb(process.argv.slice(2));
const indexPath = path.join(publicRoot, 'index.html');

let html;

try {
  html = await readFile(indexPath, 'utf8');
} catch {
  console.error(
    `找不到 ${path.relative(repoRoot, indexPath)}，请先执行 pnpm build 再跑体积检查。`,
  );
  process.exit(2);
}

const refs = collectAssetRefs(html);

if (refs.length === 0) {
  console.error('index.html 里没有找到 /assets/ 引用，构建产物不完整。');
  process.exit(2);
}

const measurements = await Promise.all(refs.map(measure));
const totalRaw = measurements.reduce((sum, item) => sum + item.rawBytes, 0);
const totalGzip = measurements.reduce((sum, item) => sum + item.gzipBytes, 0);

console.log('首屏资源：');

for (const item of measurements) {
  console.log(
    `  ${item.ref}  ${formatKb(item.rawBytes)} → gzip ${formatKb(item.gzipBytes)}`,
  );
}

console.log(
  `总计：${formatKb(totalRaw)} → gzip ${formatKb(totalGzip)}（阈值 ${maxGzipKb} KB）`,
);

const maxGzipBytes = maxGzipKb * 1024;

if (totalGzip > maxGzipBytes) {
  console.error(
    `✗ 首屏体积超阈值：gzip ${formatKb(totalGzip)} > ${maxGzipKb} KB`,
  );
  process.exit(1);
}

console.log('✓ 首屏体积在阈值内');

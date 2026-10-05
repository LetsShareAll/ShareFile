/**
 * 构建前清理：只删除 Vite 生成的 UI 产物（index.html 与 public/assets 顶层的 js/css/map），
 * 保留 public/assets/data（索引与清单）、public/assets/styles、public/404.html 与二进制。
 *
 * 之所以需要它：vite.config 里 emptyOutDir=false（否则会清空 public 的数据与二进制），
 * 于是每次构建都会留下上一次的带 hash chunk。
 */

import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../public',
);
const assetsRoot = path.join(publicRoot, 'assets');

const UI_EXTENSIONS = new Set(['.js', '.css', '.map']);

async function removeGeneratedAssets() {
  let entries;

  try {
    entries = await readdir(assetsRoot);
  } catch {
    return [];
  }

  const removed = [];

  for (const entry of entries) {
    const entryPath = path.join(assetsRoot, entry);
    const info = await stat(entryPath).catch(() => null);

    if (!info?.isFile()) continue;
    if (!UI_EXTENSIONS.has(path.extname(entry))) continue;

    await rm(entryPath);
    removed.push(entry);
  }

  return removed;
}

const removedAssets = await removeGeneratedAssets();
const indexPath = path.join(publicRoot, 'index.html');
const indexInfo = await stat(indexPath).catch(() => null);

if (indexInfo?.isFile()) {
  await rm(indexPath);
  removedAssets.unshift('index.html');
}

console.log(
  removedAssets.length
    ? `已清理 ${removedAssets.length} 个旧 UI 产物：${removedAssets.join(', ')}`
    : '没有需要清理的旧 UI 产物',
);

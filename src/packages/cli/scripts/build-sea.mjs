import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const distRoot = path.join(packageRoot, 'dist', 'sea');
const bundleOnly = process.argv.includes('--bundle-only');
const maxExecutableSizeBytes = 95 * 1024 * 1024;
const executableSuffix =
  process.platform === 'win32'
    ? '-windows.exe'
    : process.platform === 'darwin'
      ? '-macos'
      : '-linux';

const targets = [
  {
    name: 'generate-info',
    entryPoint: path.join(packageRoot, 'src', 'generate-info.ts'),
  },
  {
    name: 'generate-share-file',
    entryPoint: path.join(packageRoot, 'src', 'generate-share-file.ts'),
  },
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getFileSize(filePath) {
  return fs.statSync(filePath).size;
}

function stripExecutable(filePath) {
  if (process.platform === 'win32') return;

  const args =
    process.platform === 'darwin'
      ? ['-x', filePath]
      : ['--strip-all', filePath];
  const beforeSize = getFileSize(filePath);
  const result = spawnSync('strip', args, {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    console.warn(
      `strip 不可用或执行失败，保留未剥离产物: ${path.basename(filePath)}`,
    );
    return;
  }

  const afterSize = getFileSize(filePath);
  console.log(
    `stripped ${path.basename(filePath)}: ${formatSize(beforeSize)} -> ${formatSize(afterSize)}`,
  );
}

function assertExecutableSize(filePath) {
  const size = getFileSize(filePath);

  if (size > maxExecutableSizeBytes) {
    throw new Error(
      `${path.basename(filePath)} 为 ${formatSize(size)}，超过 ${formatSize(
        maxExecutableSizeBytes,
      )} 的提交上限预警。请压缩/剥离产物后再发布。`,
    );
  }
}

async function buildBundle(target) {
  const bundlePath = path.join(distRoot, `${target.name}.mjs`);

  await esbuild.build({
    entryPoints: [target.entryPoint],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    target: 'node26',
    format: 'esm',
    logLevel: 'info',
  });

  return bundlePath;
}

async function buildExecutable(target, bundlePath) {
  const outputPath = path.join(distRoot, `${target.name}${executableSuffix}`);
  const seaConfigPath = path.join(distRoot, `${target.name}.sea.json`);
  const seaConfig = {
    main: bundlePath,
    output: outputPath,
    mainFormat: 'module',
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
  };

  await fsp.writeFile(seaConfigPath, JSON.stringify(seaConfig, null, 2));
  run(process.execPath, ['--build-sea', seaConfigPath]);

  stripExecutable(outputPath);
  assertExecutableSize(outputPath);

  if (process.platform !== 'win32') {
    fs.chmodSync(outputPath, 0o755);
  }
}

await fsp.rm(distRoot, { recursive: true, force: true });
await fsp.mkdir(distRoot, { recursive: true });

for (const target of targets) {
  const bundlePath = await buildBundle(target);

  if (!bundleOnly) {
    await buildExecutable(target, bundlePath);
  }
}

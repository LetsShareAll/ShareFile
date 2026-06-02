import path from 'node:path';
import { createConfig } from '../packages/ui/scripts/esbuild.config.mjs';
import {
  publicRoot,
  repoRoot,
  uiPackageRoot,
} from '../packages/ui/scripts/paths.mjs';

const expectedRepoRoot = process.cwd();
const expectedPublicRoot = path.join(expectedRepoRoot, 'public');
const expectedUiPackageRoot = path.join(expectedRepoRoot, 'packages/ui');
const config = createConfig({ dev: false });

const checks = [
  ['repoRoot', repoRoot, expectedRepoRoot],
  ['publicRoot', publicRoot, expectedPublicRoot],
  ['uiPackageRoot', uiPackageRoot, expectedUiPackageRoot],
  [
    'esbuild outfile',
    config.outfile,
    path.join(expectedPublicRoot, 'assets/scripts/index.js'),
  ],
  [
    'esbuild entrypoint',
    config.entryPoints[0],
    path.join(expectedUiPackageRoot, 'src/index.ts'),
  ],
];

const failures = checks.filter(([, actual, expected]) => actual !== expected);

for (const [name, actual, expected] of failures) {
  console.error(`${name}: expected ${expected}, got ${actual}`);
}

if (failures.length > 0) {
  process.exit(1);
}

console.log('UI script paths check passed.');

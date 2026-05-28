import esbuild from 'esbuild';
import { createConfig } from './esbuild.config.mjs';

function parseBuildOptions(args) {
  let useCdn = true;

  for (const arg of args) {
    if (arg === '--') {
      continue;
    }

    if (arg === '--no-cdn') {
      useCdn = false;
      continue;
    }

    console.error(`Unknown build option: ${arg}`);
    console.error('Supported options: --no-cdn');
    process.exit(1);
  }

  return { useCdn };
}

const options = parseBuildOptions(process.argv.slice(2));
const config = createConfig({ dev: false, useCdn: options.useCdn });

try {
  await esbuild.build(config);
  console.log('✓ Build completed successfully');
} catch (error) {
  console.error('✗ Build failed:', error);
  process.exit(1);
}

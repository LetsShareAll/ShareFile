import esbuild from 'esbuild';
import { createConfig } from './esbuild.config.mjs';

const config = createConfig({ dev: false });

try {
  await esbuild.build(config);
  console.log('✓ Build completed successfully');
} catch (error) {
  console.error('✗ Build failed:', error);
  process.exit(1);
}

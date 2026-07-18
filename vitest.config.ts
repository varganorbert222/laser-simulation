import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine/index.ts'),
      '@engine/': path.resolve(__dirname, 'src/engine') + '/',
      '@adapters': path.resolve(__dirname, 'src/adapters'),
      '@platform': path.resolve(__dirname, 'src/platform'),
      '@app': path.resolve(__dirname, 'src/app'),
    },
  },
  test: {
    include: ['src/engine/**/*.spec.ts', 'src/platform/**/*.spec.ts'],
    environment: 'node',
  },
});

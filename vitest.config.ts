import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@engine\/(.*)$/,
        replacement: path.resolve(__dirname, 'src/engine') + '/$1',
      },
      { find: '@engine', replacement: path.resolve(__dirname, 'src/engine/index.ts') },
      { find: /^@adapters\/(.*)$/, replacement: path.resolve(__dirname, 'src/adapters') + '/$1' },
      { find: /^@platform\/(.*)$/, replacement: path.resolve(__dirname, 'src/platform') + '/$1' },
      { find: /^@app\/(.*)$/, replacement: path.resolve(__dirname, 'src/app') + '/$1' },
    ],
  },
  test: {
    include: ['src/engine/**/*.spec.ts', 'src/platform/**/*.spec.ts'],
    environment: 'node',
  },
});

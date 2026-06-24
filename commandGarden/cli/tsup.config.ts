import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  // Bundle workspace dep (@commandgarden/shared) into the output
  // so we only publish one package
  noExternal: ['@commandgarden/shared'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});

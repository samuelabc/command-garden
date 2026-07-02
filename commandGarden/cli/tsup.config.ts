import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  // Bundle all JS deps into dist/main.js so the CLI works standalone
  // (npm link, global install). Only native addons stay external.
  // At runtime this inlines: commander, cli-table3, yaml, zod (via shared),
  // @commandgarden/shared. Other deps (fastify, etc.) are matched by the
  // regex but never imported by the CLI, so tsup ignores them.
  // The daemon/app deps remain in package.json "dependencies" so npm
  // installs them for the separate daemon/app child processes.
  noExternal: [/^(?!better-sqlite3)/],
  // CJS deps (commander, cli-table3, etc.) emit require() calls that fail in
  // ESM because `require` is undefined. Injecting createRequire gives esbuild's
  // __require shim a real require to delegate to, fixing all builtin/CJS interop.
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire as __cjsRequire } from "module"; const require = __cjsRequire(import.meta.url);',
    ].join('\n'),
  },
});

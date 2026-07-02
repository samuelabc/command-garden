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
  banner: {
    js: '#!/usr/bin/env node',
  },
});

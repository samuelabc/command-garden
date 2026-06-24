import { build } from 'esbuild';
import { cpSync } from 'node:fs';

// Bundle service worker (ESM for MV3 module workers)
await build({
  entryPoints: ['src/background/service-worker.ts'],
  bundle: true,
  outfile: 'dist/service-worker.js',
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
});

// Bundle content script (IIFE — no module support in content scripts)
await build({
  entryPoints: ['src/content/content-script.ts'],
  bundle: true,
  outfile: 'dist/content-script.js',
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
});

// Copy manifest
cpSync('manifest.json', 'dist/manifest.json');

console.log('Build complete → dist/');

import { build } from 'esbuild';
import { cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sharedOpts = {
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
  alias: {
    'node:crypto': resolve(__dirname, 'src/shims/node-crypto.ts'),
    'node:fs': resolve(__dirname, 'src/shims/node-fs.ts'),
  },
};

// Bundle service worker (ESM for MV3 module workers)
await build({
  ...sharedOpts,
  entryPoints: ['src/background/service-worker.ts'],
  outfile: 'dist/service-worker.js',
  format: 'esm',
});

// Bundle content script (IIFE — no module support in content scripts)
await build({
  ...sharedOpts,
  entryPoints: ['src/content/content-script.ts'],
  outfile: 'dist/content-script.js',
  format: 'iife',
});

// Bundle popup (IIFE — standard page script)
await build({
  ...sharedOpts,
  entryPoints: ['src/popup/popup.ts'],
  outfile: 'dist/popup.js',
  format: 'iife',
});

// Copy popup HTML
cpSync('src/popup/popup.html', 'dist/popup.html');

// Copy manifest
cpSync('manifest.json', 'dist/manifest.json');

// Copy icons
cpSync('icons', 'dist/icons', { recursive: true });

console.log('Build complete → dist/');

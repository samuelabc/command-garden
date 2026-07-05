#!/usr/bin/env node
// scripts/prepare-bundle.mjs
//
// Copies workspace packages into cli/node_modules/@commandgarden/
// so that npm pack includes them via bundleDependencies.
//
// npm workspaces hoist deps to the monorepo root node_modules/ and
// uses symlinks for workspace packages. bundleDependencies expects
// packages in the package's own node_modules/, so this script bridges
// the gap by copying each package's published files (package.json +
// entries listed in "files") into the correct location.

import { cpSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliDir = join(__dirname, '..');
const monorepoDir = join(cliDir, '..');

const PACKAGES = ['shared', 'daemon', 'app', 'chrome'];

console.log('Preparing workspace packages for bundleDependencies...\n');

let hasErrors = false;

for (const pkg of PACKAGES) {
  const srcDir = join(monorepoDir, pkg);
  const destDir = join(cliDir, 'node_modules', '@commandgarden', pkg);

  // Read the package's own package.json to get "files" field
  const pkgJsonPath = join(srcDir, 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  const filesToInclude = pkgJson.files || [];

  // Validate that dist directories exist
  for (const f of filesToInclude) {
    const fullPath = join(srcDir, f);
    if (!existsSync(fullPath)) {
      console.error(`  ERROR: @commandgarden/${pkg} — "${f}" not found at ${fullPath}`);
      console.error(`         Run "npm run build" from the monorepo root first.\n`);
      hasErrors = true;
    }
  }

  if (hasErrors) continue;

  // Clean and recreate destination
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });

  // Copy package.json (always included)
  cpSync(pkgJsonPath, join(destDir, 'package.json'));

  // Copy each entry listed in "files"
  for (const f of filesToInclude) {
    const src = join(srcDir, f);
    const dest = join(destDir, f);
    cpSync(src, dest, { recursive: true });
  }

  console.log(`  Bundled @commandgarden/${pkg}`);
}

if (hasErrors) {
  console.error('\nBundle preparation failed. Build all packages first:');
  console.error('  cd commandGarden && npm run build\n');
  process.exit(1);
}

console.log('\nDone. Ready for npm pack / npm publish.\n');

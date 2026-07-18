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

import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliDir = join(__dirname, '..');
const monorepoDir = join(cliDir, '..', '..');
const srcPackagesDir = join(monorepoDir, 'src');

const PACKAGES = ['shared', 'daemon', 'app', 'chrome'];

console.log('Preparing workspace packages for bundleDependencies...\n');

let hasErrors = false;

for (const pkg of PACKAGES) {
  const srcDir = join(srcPackagesDir, pkg);
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

  // Write package.json without "files" field — npm otherwise filters bundled
  // dependency contents by their own files field, excluding skills/ etc.
  const { files: _files, ...pkgJsonWithoutFiles } = pkgJson;
  writeFileSync(join(destDir, 'package.json'), JSON.stringify(pkgJsonWithoutFiles, null, 2) + '\n');

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
  console.error('  npm run build\n');
  process.exit(1);
}

// Copy skills/ into the bundled app package so the app server can serve them
const skillsSrc = join(monorepoDir, 'skills');
const skillsDest = join(cliDir, 'node_modules', '@commandgarden', 'app', 'skills');
if (existsSync(skillsSrc)) {
  rmSync(skillsDest, { recursive: true, force: true });
  cpSync(skillsSrc, skillsDest, { recursive: true });
  console.log('  Bundled skills/ into @commandgarden/app');
} else {
  console.log('  WARN: skills/ directory not found — skipping');
}

console.log('\nDone. Ready for npm pack / npm publish.\n');

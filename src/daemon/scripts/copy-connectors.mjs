#!/usr/bin/env node
// scripts/copy-connectors.mjs
//
// Copies the monorepo's canonical connectors/ directory into daemon/connectors/
// so it can be declared in daemon/package.json's "files" field and picked up
// by cli/scripts/prepare-bundle.mjs for bundleDependencies.

import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const daemonDir = join(__dirname, '..');
const monorepoDir = join(daemonDir, '..', '..');

const srcDir = join(monorepoDir, 'connectors');
const destDir = join(daemonDir, 'connectors');

if (!existsSync(srcDir)) {
  console.error(`ERROR: canonical connectors directory not found at ${srcDir}`);
  process.exit(1);
}

rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });
cpSync(srcDir, destDir, { recursive: true });

console.log(`Copied connectors from ${srcDir} to ${destDir}`);

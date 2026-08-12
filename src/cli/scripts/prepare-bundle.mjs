#!/usr/bin/env node
// scripts/prepare-bundle.mjs
//
// Produces a fully self-contained cli/node_modules/ so that `npm pack`
// bundles EVERYTHING the published package needs at runtime:
//
//   1. The private @commandgarden/* workspace packages (copied from src/).
//   2. The complete third-party production dependency tree, copied from the
//      monorepo's already-installed root node_modules/ (exact, lockfile-pinned
//      versions — the ones we actually built and tested against).
//
// Why the third-party tree must be physically bundled:
//   The CLI spawns the daemon/app as separate Node processes that import
//   third-party deps (zod, fastify, sql.js, ...). Those packages are declared
//   as dependencies of the bundled @commandgarden/* packages. When a consumer
//   runs `npm install -g`, npm treats every dependency of a bundleDependency as
//   part of the bundle ("inBundle") and does NOT fetch it from the registry — it
//   only extracts what physically ships in the tarball. If those deps are absent
//   from the tarball, the global install ends up with EMPTY dependency directories
//   (node_modules/zod, node_modules/fastify, ...) and the daemon crashes at
//   startup with ERR_MODULE_NOT_FOUND. (Local, non-global installs happen to work
//   because hoisting sidesteps this — so the bug only bites `npm i -g`.)
//   Physically bundling the whole prod tree + "bundleDependencies": true makes
//   the tarball self-contained, so nothing is ever fetched at install time.
//
// Why copy from root node_modules instead of a fresh `npm install`:
//   The root node_modules already holds the exact, lockfile-pinned closure the
//   monorepo built and tested against. Copying it (rather than re-resolving
//   floating ranges from the registry at pack time) means the tarball ships
//   precisely the tested versions, with no network access and no version drift.

import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliDir = join(__dirname, '..');
const monorepoDir = join(cliDir, '..', '..');
const srcPackagesDir = join(monorepoDir, 'src');

const PACKAGES = ['shared', 'daemon', 'app', 'chrome'];

console.log('Preparing workspace packages for bundleDependencies...\n');

let hasErrors = false;

// Fail fast: bundleDependencies must be `true`, or none of the work below packs.
const cliPkg = JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf-8'));
if (cliPkg.bundleDependencies !== true) {
  console.error('  ERROR: cli/package.json "bundleDependencies" must be `true` for the full tree to be packed.');
  process.exit(1);
}

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

// --- Bundle the third-party production dependency tree -----------------------
//
// Copy the resolved production closure straight out of the monorepo's root
// node_modules/ (exact, lockfile-pinned versions) into cli/node_modules/.
// Combined with "bundleDependencies": true, this ships the entire prod tree in
// the tarball — with no network access and no version drift.

console.log('\nBundling third-party production dependencies (from root node_modules)...');

const rootModules = join(monorepoDir, 'node_modules');
if (!existsSync(rootModules)) {
  console.error(`  ERROR: root node_modules not found at ${rootModules}.`);
  console.error('         Run "npm install" from the monorepo root first.\n');
  process.exit(1);
}

const cliModules = join(cliDir, 'node_modules');
mkdirSync(cliModules, { recursive: true });

// Start from a clean slate so stale packages from a previous prepack run (e.g.
// a dep that has since been removed or moved to devDependencies) never linger.
// Keep the freshly-copied @commandgarden/* workspace packages and any dotfiles.
// This must happen BEFORE `npm ls` below: otherwise npm resolves the CLI's own
// deps (commander, cli-table3, ...) to their stale copies here instead of the
// hoisted root node_modules, and they get filtered out of the closure.
for (const entry of readdirSync(cliModules)) {
  if (entry === '@commandgarden' || entry.startsWith('.')) continue;
  rmSync(join(cliModules, entry), { recursive: true, force: true });
}

// Ask npm for the resolved production closure. --parseable --long prints one
// line per installed package as `PATH:NAME@VERSION[:STATE]` (POSIX paths have no
// colon); --all walks the full transitive tree. We publish from macOS/Linux.
const lsOutput = execFileSync(
  'npm',
  ['ls', '--omit=dev', '--all', '--parseable', '--long'],
  { cwd: monorepoDir, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
);

// Keep only top-level packages directly under the root node_modules/ (recursive
// copy carries any private nested node_modules along, e.g. fastify/node_modules).
// Scoped packages (@scope/name) live one directory deeper.
const topLevelNames = new Set();
for (const line of lsOutput.split('\n')) {
  if (!line.trim()) continue;
  const [abs, ...meta] = line.split(':');
  if (meta[meta.length - 1] === 'EXTRANEOUS') continue; // not a real dependency
  if (!abs.startsWith(rootModules + sep)) continue;
  const parts = relative(rootModules, abs).split(sep);
  // Reject anything nested inside another package's node_modules.
  if (parts.includes('node_modules')) continue;
  const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  if (!name || name.startsWith('@commandgarden/')) continue; // ours: copied from src/
  topLevelNames.add(name);
}

let copied = 0;
for (const name of topLevelNames) {
  const src = join(rootModules, ...name.split('/'));
  if (!existsSync(src)) {
    console.error(`  ERROR: "${name}" is in the prod closure but missing from root node_modules (${src}).`);
    hasErrors = true;
    continue;
  }
  const dest = join(cliModules, ...name.split('/'));
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: true });
  copied++;
}
console.log(`  Bundled ${copied} third-party package dir(s) into cli/node_modules`);

// Guard: a resolved tree copied from disk is never re-resolved at install time,
// so platform-specific packages (native prebuilds, os/cpu-gated deps) would ship
// the publisher's-OS binary to every user. Refuse to bundle them.
for (const name of topLevelNames) {
  const pkgJsonPath = join(cliModules, ...name.split('/'), 'package.json');
  if (!existsSync(pkgJsonPath)) continue;
  const { os: osField, cpu: cpuField } = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  if (osField || cpuField) {
    console.error(`  ERROR: "${name}" declares platform constraints (os=${JSON.stringify(osField)} cpu=${JSON.stringify(cpuField)}).`);
    console.error('         Platform-specific packages cannot be safely bundled into a cross-platform tarball.');
    hasErrors = true;
  }
}

// Sanity check: every declared third-party runtime dep must physically resolve
// now, or the published global install will break with ERR_MODULE_NOT_FOUND.
const declaredRuntimeDeps = new Set();
for (const pkg of ['cli', ...PACKAGES]) {
  const pkgDir = pkg === 'cli' ? cliDir : join(srcPackagesDir, pkg);
  const { dependencies = {} } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
  for (const name of Object.keys(dependencies)) {
    if (name.startsWith('@commandgarden/')) continue; // bundled separately from src/
    declaredRuntimeDeps.add(name);
  }
}
for (const name of declaredRuntimeDeps) {
  const entry = join(cliModules, ...name.split('/'), 'package.json');
  if (!existsSync(entry)) {
    console.error(`  ERROR: bundled dependency "${name}" is missing after copy (${entry}).`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\nBundle preparation failed while bundling third-party dependencies.\n');
  process.exit(1);
}

console.log('\nDone. Ready for npm pack / npm publish.\n');

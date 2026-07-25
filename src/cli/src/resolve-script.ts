// src/resolve-script.ts
import { join, dirname } from 'node:path';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/**
 * Resolve the path to a sibling workspace package's entry point.
 *
 * Resolution strategy:
 * 1. Relative path from baseDir — works inside the monorepo
 * 2. Package resolution via createRequire — works for global install (after npm link)
 * 3. Fail with actionable guidance showing all paths attempted
 */
export function resolveScript(
  baseDir: string,
  relativePath: string,
  packageName: string,
  entryPoint: string,
): string {
  const looked: string[] = [];

  // Resolve symlinks/junctions so Windows npm-link junctions point to the real monorepo path
  let resolvedBase = baseDir;
  try { resolvedBase = realpathSync(baseDir); } catch { /* use original if resolution fails */ }

  // 1. Relative path — works inside the monorepo
  const relative = join(resolvedBase, relativePath);
  if (existsSync(relative)) return relative;
  looked.push(`  - ${relative}  (relative — not found)`);

  // 2. Package resolution — works for global install (after npm link)
  try {
    const req = createRequire(pathToFileURL(join(baseDir, '_')).href);
    const pkgJsonPath = req.resolve(`${packageName}/package.json`);
    const resolved = join(dirname(pkgJsonPath), entryPoint);
    if (existsSync(resolved)) return resolved;
    looked.push(`  - ${resolved}  (package found, entry point not built)`);
  } catch {
    looked.push(`  - ${packageName}  (package not resolvable via require)`);
  }

  // 3. Fail with actionable guidance
  const monorepoRoot = findMonorepoRoot(baseDir);

  console.error(`Cannot find ${packageName} entry point.`);
  console.error('');
  console.error('Looked at:');
  for (const line of looked) console.error(line);
  console.error('');

  if (monorepoRoot) {
    console.error('To fix this, run from the monorepo root:');
    console.error(`  cd ${monorepoRoot} && npm install && npm run build`);
    console.error('');
    console.error('Then re-link the CLI globally:');
    console.error(`  cd ${join(monorepoRoot, 'src/cli')} && npm link`);
  } else {
    console.error('To fix this, run from the monorepo root:');
    console.error('  cd <monorepo> && npm install && npm run build');
    console.error('');
    console.error('Then re-link the CLI globally:');
    console.error('  cd <monorepo>/src/cli && npm link');
  }

  process.exit(1);
}

/**
 * Resolve the Node.js binary to use for spawning child processes.
 *
 * Resolution strategy:
 * 1. Bundled runtime node relative to CLI dist/ (installer layout)
 * 2. Fallback to system 'node' on PATH (developer/npm-install path)
 */
export function resolveNodeBinary(baseDir: string): string {
  let resolvedBase = baseDir;
  try { resolvedBase = realpathSync(baseDir); } catch { /* use original */ }

  // Installer layout: .../Resources/app/cli/dist/main.js → baseDir is .../Resources/app/cli/dist/
  // Bundled node at:  .../Resources/runtime/node
  // From dist/, go up 3 levels (dist → cli → app → Resources) then into runtime/
  const bundled = join(resolvedBase, '..', '..', '..', 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
  if (existsSync(bundled)) return bundled;

  return 'node';
}

/**
 * Walk up from startDir to find a directory containing a package.json
 * with a `workspaces` field (the monorepo root).
 */
export function findMonorepoRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const content = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (Array.isArray(content.workspaces)) return dir;
      } catch { /* ignore parse errors */ }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

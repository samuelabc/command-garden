# Bundling Connectors with the Published CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two existing connectors (`teams/room-availability`, `timetracking/report`) inside the published `@commandgarden/cli` npm package so a fresh install has working connectors with zero setup, without reintroducing any CWD-dependent behavior.

**Architecture:** Treat `daemon/connectors/` as a build artifact (same pattern as `daemon/dist/`), populated by a new copy script from the canonical `commandGarden/connectors/` directory. Add it to `daemon/package.json`'s `files` field so the existing `cli/scripts/prepare-bundle.mjs` picks it up automatically. Compute the bundled directory's absolute path in `daemon/src/config.ts` relative to the compiled module's own file location (`import.meta.url`), and add it as the first entry in the default `connectors.paths` array.

**Tech Stack:** Node.js (ESM, `node:fs`/`node:path`/`node:url`), TypeScript, Zod, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-connector-distribution-design.md`
- Canonical connector source stays at `commandGarden/connectors/` — no files move.
- Bundled path must resolve via the compiled script's own location (`import.meta.url`), never `process.cwd()` or `homedir()` — this is the property that makes it work identically in monorepo dev and in a global npm install.
- `connectors.paths` default order: bundled directory first, `~/.commandgarden/connectors` second — later paths win on `site/name` key collision in `ConnectorRegistry.load()`, so user-defined connectors override bundled ones with the same key.
- No changes to `ConnectorRegistry`, the connector YAML schema, or the security/approval model.
- No changes needed to `cli/scripts/prepare-bundle.mjs` — it already copies whatever is listed in each workspace package's `package.json` `files` field.

---

### Task 1: Build script to populate `daemon/connectors/`

**Files:**
- Create: `commandGarden/daemon/scripts/copy-connectors.mjs`
- Modify: `commandGarden/daemon/package.json`
- Modify: `commandGarden/.gitignore`

**Interfaces:**
- Consumes: `commandGarden/connectors/` (canonical source, already exists, contains `teams-room-availability.yaml`, `teams-room-availability.eval.js`, `timetracking-report.yaml`, `timetracking-report.eval.js`).
- Produces: `commandGarden/daemon/connectors/` directory containing an exact copy of the above, created/refreshed by `npm run build` in the `daemon` workspace.

- [ ] **Step 1: Create the copy script**

```javascript
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
const monorepoDir = join(daemonDir, '..');

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
```

Save to `commandGarden/daemon/scripts/copy-connectors.mjs`.

- [ ] **Step 2: Wire the script into the daemon's build, and declare it for bundling**

In `commandGarden/daemon/package.json`, change:

```json
  "scripts": {
    "build": "tsc",
```

to:

```json
  "scripts": {
    "build": "tsc && node scripts/copy-connectors.mjs",
```

And change:

```json
  "files": [
    "dist"
  ],
```

to:

```json
  "files": [
    "dist",
    "connectors"
  ],
```

- [ ] **Step 3: Ignore the generated directory in git**

In `commandGarden/.gitignore`, add a new line (the existing bare `dist/` pattern must NOT be reused here — it would be fine since there's no other `connectors` build artifact, but be explicit and anchor it to avoid ever matching the canonical `commandGarden/connectors/` directory):

```
/daemon/connectors/
```

Full resulting file:

```
node_modules/
dist/
coverage/
*.tsbuildinfo
.env
/daemon/connectors/
```

- [ ] **Step 4: Run the build and verify the artifact**

Run: `npm run build` with `Cwd` set to `commandGarden/daemon`

Expected output includes:
```
Copied connectors from <...>\commandGarden\connectors to <...>\commandGarden\daemon\connectors
```

Then verify contents match:

Run: `Get-ChildItem commandGarden\daemon\connectors` with `Cwd` set to `commandGarden`

Expected: 4 files — `teams-room-availability.eval.js`, `teams-room-availability.yaml`, `timetracking-report.eval.js`, `timetracking-report.yaml`.

- [ ] **Step 5: Commit**

```
git add commandGarden/daemon/scripts/copy-connectors.mjs commandGarden/daemon/package.json commandGarden/.gitignore
git commit -m "build(daemon): copy canonical connectors into daemon/connectors for bundling"
```

(`daemon/connectors/` itself is gitignored and must NOT be added.)

---

### Task 2: Compute the bundled connectors path and update the config default (TDD)

**Files:**
- Modify: `commandGarden/daemon/src/config.ts`
- Test: `commandGarden/daemon/src/config.test.ts`

**Interfaces:**
- Consumes: `commandGarden/daemon/connectors/` (produced by Task 1; only needs to exist for the daemon's *runtime* discovery, not for this task's unit tests, which check the computed path string, not filesystem contents).
- Produces: `configSchema`'s default `connectors.paths` is now `[BUNDLED_CONNECTORS_DIR, '~/.commandgarden/connectors']` where `BUNDLED_CONNECTORS_DIR` is an absolute path computed from `import.meta.url`.

- [ ] **Step 1: Write the failing test**

In `commandGarden/daemon/src/config.test.ts`, change the import line:

```typescript
import { join } from 'node:path';
```

to:

```typescript
import { join, isAbsolute } from 'node:path';
```

Then add a new test inside the `describe('configSchema', ...)` block (after the existing `'rejects invalid output format'` test):

```typescript
  it('includes an absolute, cwd-independent bundled connectors directory as the first default path', () => {
    const originalCwd = process.cwd();
    process.chdir(tmpdir());
    try {
      const c = configSchema.parse({});
      expect(c.connectors.paths).toHaveLength(2);
      expect(isAbsolute(c.connectors.paths[0])).toBe(true);
      expect(c.connectors.paths[0]).toContain('connectors');
      expect(c.connectors.paths[0]).not.toBe('./connectors');
      expect(c.connectors.paths[1]).toBe('~/.commandgarden/connectors');
    } finally {
      process.chdir(originalCwd);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.ts` with `Cwd` set to `commandGarden/daemon`

Expected: FAIL — `c.connectors.paths` currently has length 1, not 2.

- [ ] **Step 3: Implement the config change**

In `commandGarden/daemon/src/config.ts`, change the imports:

```typescript
// src/config.ts
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
```

to:

```typescript
// src/config.ts
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const BUNDLED_CONNECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../connectors');
```

Then change:

```typescript
  connectors: z.object({
    paths: z.array(z.string()).default(['~/.commandgarden/connectors']),
  }).default({}),
```

to:

```typescript
  connectors: z.object({
    paths: z.array(z.string()).default([BUNDLED_CONNECTORS_DIR, '~/.commandgarden/connectors']),
  }).default({}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.test.ts` with `Cwd` set to `commandGarden/daemon`

Expected: PASS, all tests in the file green (including the pre-existing ones — confirm none regressed).

- [ ] **Step 5: Commit**

```
git add commandGarden/daemon/src/config.ts commandGarden/daemon/src/config.test.ts
git commit -m "feat(daemon): default connectors.paths to a bundled, cwd-independent directory"
```

---

### Task 3: Registry test simulating a fresh install

**Files:**
- Test: `commandGarden/daemon/src/registry.test.ts`

**Interfaces:**
- Consumes: `ConnectorRegistry` (existing class, unchanged) — constructor `new ConnectorRegistry(paths: string[])`, method `load(): { loaded: number; errors: string[] }`, method `get(key: string)`.
- Produces: regression coverage locking in that `ConnectorRegistry` correctly loads from the first path in an array when the second path (representing `~/.commandgarden/connectors` on a fresh install) does not exist yet.

- [ ] **Step 1: Add the test**

This exercises existing, already-correct `ConnectorRegistry` behavior under the exact array shape `loadConfig()` now produces by default on a machine with no `config.yaml` and no `~/.commandgarden/connectors` directory yet — no production code change is needed for this test to pass, so there is no red step. Add it inside the `describe('ConnectorRegistry', ...)` block in `commandGarden/daemon/src/registry.test.ts`, after the existing `'skips nonexistent directories'` test:

```typescript
  it('simulates a fresh install: loads bundled connectors when the user-defined path does not exist yet', () => {
    const reg = new ConnectorRegistry([tmpDir, '/nonexistent/user/connectors']);
    const { loaded, errors } = reg.load();
    expect(loaded).toBe(1);
    expect(errors).toHaveLength(0);
    expect(reg.get('test/cmd')).toBeDefined();
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/registry.test.ts` with `Cwd` set to `commandGarden/daemon`

Expected: PASS, all tests in the file green.

- [ ] **Step 3: Commit**

```
git add commandGarden/daemon/src/registry.test.ts
git commit -m "test(daemon): cover fresh-install connector loading shape"
```

---

### Task 4: Full build, test, and tarball verification

**Files:** None modified — verification only.

**Interfaces:** N/A.

- [ ] **Step 1: Run the full test suite for daemon and cli**

Run: `npm test` with `Cwd` set to `commandGarden/daemon`
Expected: all test files pass (was 8 files / 86 tests before this plan; now 8 files / 88 tests after Tasks 2–3 add two tests).

Run: `npm test` with `Cwd` set to `commandGarden/cli`
Expected: all 16 files / 114 tests pass, unchanged (no cli test files touched by this plan).

- [ ] **Step 2: Full monorepo build**

Run: `npm run build` with `Cwd` set to `commandGarden`
Expected: all workspace builds succeed, including the new `Copied connectors from ... to ...` line from the daemon build.

- [ ] **Step 3: Verify the published tarball actually contains the connector files**

`npm pack --dry-run`'s summary view does not itemize files inside bundled dependencies, so build a real tarball and inspect it directly:

Run: `npm pack` with `Cwd` set to `commandGarden/cli`
Expected: creates `commandgarden-cli-<version>.tgz` in `commandGarden/cli`.

Run: `tar -tzf commandgarden-cli-<version>.tgz | Select-String connectors` with `Cwd` set to `commandGarden/cli` (substitute the actual generated filename/version)
Expected: lists 4 entries, e.g.:
```
package/node_modules/@commandgarden/daemon/connectors/teams-room-availability.eval.js
package/node_modules/@commandgarden/daemon/connectors/teams-room-availability.yaml
package/node_modules/@commandgarden/daemon/connectors/timetracking-report.eval.js
package/node_modules/@commandgarden/daemon/connectors/timetracking-report.yaml
```

- [ ] **Step 4: Clean up the generated tarball**

Run: `Remove-Item commandgarden-cli-*.tgz` with `Cwd` set to `commandGarden/cli`
Expected: tarball removed, no tracked-file changes (it was never `git add`ed).

- [ ] **Step 5: No commit** (verification-only task, nothing to commit)

---

### Task 5: Update README

**Files:**
- Modify: `commandGarden/README.md`

**Interfaces:** N/A — documentation only.

- [ ] **Step 1: Update the config example**

Change:

```yaml
connectors:
  paths:
    - "~/.commandgarden/connectors"
```

to:

```yaml
connectors:
  paths:
    - "<bundled-in-package>/connectors"   # built-in, ships with the CLI
    - "~/.commandgarden/connectors"        # your own connectors override built-ins with the same key
```

- [ ] **Step 2: Update the daemon-startup bullet**

Change:

```
- Load connectors from `~/.commandgarden/connectors` (the daemon always runs with this as its working directory, regardless of where `cg` was launched from; add repo-relative or absolute paths to `connectors.paths` in `config.yaml` for monorepo-local development)
```

to:

```
- Load connectors from its own bundled `connectors/` directory (ships with the package — works immediately after install) and then `~/.commandgarden/connectors` (your own connectors; same `site/name` key overrides the bundled version). Add further repo-relative or absolute paths to `connectors.paths` in `config.yaml` for monorepo-local development.
```

- [ ] **Step 3: Update "Writing a Custom Connector" intro**

Change:

```
Create a YAML file in `connectors/` (built-in) or `~/.commandgarden/connectors/` (user-defined):
```

to:

```
Create a YAML file in `~/.commandgarden/connectors/` (user-defined; overrides a built-in connector with the same `site/name`). Built-in connectors ship inside the package itself and are rebuilt from `connectors/` at the monorepo root — see `daemon/scripts/copy-connectors.mjs` if you're adding one there.
```

- [ ] **Step 4: Commit**

```
git add commandGarden/README.md
git commit -m "docs: document bundled connector discovery"
```

---

### Task 6: End-to-end verification on the live global install

**Files:** None (manual verification against the already-published global `cg` install, mirroring the approach used for the CWD-independence fix).

**Interfaces:** N/A.

- [ ] **Step 1: Copy the freshly built daemon (dist + connectors) and cli into the global install**

Run (PowerShell, `Cwd` set to `commandGarden`):
```powershell
Copy-Item ".\cli\dist\main.js" "$env:APPDATA\npm\node_modules\@commandgarden\cli\dist\main.js" -Force
Copy-Item ".\daemon\dist\*" "$env:APPDATA\npm\node_modules\@commandgarden\cli\node_modules\@commandgarden\daemon\dist\" -Force -Recurse
New-Item -ItemType Directory -Force -Path "$env:APPDATA\npm\node_modules\@commandgarden\cli\node_modules\@commandgarden\daemon\connectors" | Out-Null
Copy-Item ".\daemon\connectors\*" "$env:APPDATA\npm\node_modules\@commandgarden\cli\node_modules\@commandgarden\daemon\connectors\" -Force
```

- [ ] **Step 2: Simulate a fresh install by removing the previously manually-copied user connectors**

Run: `Remove-Item "$env:USERPROFILE\.commandgarden\connectors" -Recurse -Force` with `Cwd` set to `commandGarden`

This removes the one-off workaround copy made earlier in this session, so the only remaining source is the newly-bundled path — a true fresh-install simulation.

- [ ] **Step 3: Ask the user to restart the daemon from an unrelated directory and confirm connectors load**

Since this tool's `run_command` harness cannot reliably wait on detached background processes without hanging (see prior sessions in this conversation), ask the user to run `cg down` then `cg up` themselves from any directory, then check `http://127.0.0.1:19826` in their browser (GUI Connectors page) or report the result — expect both `teams/room-availability` and `timetracking/report` to appear with no manual setup.

- [ ] **Step 4: No commit** (manual verification only)

---

### Task 7: Version bump and publish

**Files:**
- Modify: `commandGarden/cli/package.json`
- Modify: `commandGarden/package-lock.json`

**Interfaces:** N/A.

- [ ] **Step 1: Bump the patch version**

In `commandGarden/cli/package.json`, change `"version": "1.2.2"` to `"version": "1.2.3"`.

In `commandGarden/package-lock.json`, under the `"cli"` workspace entry, change `"version": "1.2.2"` to `"version": "1.2.3"`.

- [ ] **Step 2: Rebuild everything**

Run: `npm run build` with `Cwd` set to `commandGarden`
Expected: succeeds, same as Task 4 Step 2.

- [ ] **Step 3: Verify the tarball one more time at the new version**

Run: `npm pack --dry-run` with `Cwd` set to `commandGarden/cli`
Expected: `npm notice version: 1.2.3`, `npm notice bundled deps: 3`.

- [ ] **Step 4: Commit the version bump**

```
git add commandGarden/cli/package.json commandGarden/package-lock.json
git commit -m "chore(commandgarden): publish cli v1.2.3"
```

- [ ] **Step 5: Publish (requires explicit user approval — do not mark SafeToAutoRun)**

Run: `npm publish --access public` with `Cwd` set to `commandGarden/cli`

- [ ] **Step 6: Verify the publish and push**

Run: `npm view @commandgarden/cli versions --json --safe-chain-skip-minimum-package-age` with `Cwd` set to `commandGarden/cli`
Expected: array includes `"1.2.3"`.

Run: `git push` with `Cwd` set to `commandGarden` (requires explicit user approval)
Expected: `main -> main` pushed with no errors.

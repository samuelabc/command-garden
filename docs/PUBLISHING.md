# Publishing @commandgarden/cli

This guide covers publishing `@commandgarden/cli` to the npm registry. Only the CLI package is published; the daemon, app, and shared packages are bundled into the CLI tarball automatically.

---

## How it works

The CLI is a single published npm package that ships three private workspace packages inside it:

| Package | Role | Bundled via |
|---|---|---|
| `@commandgarden/shared` | Types, schemas, utilities | `bundleDependencies` + tsup `noExternal` (inlined into CLI bundle) |
| `@commandgarden/daemon` | Local HTTP/WS server (Fastify + SQLite) | `bundleDependencies` |
| `@commandgarden/app` | Web GUI server + SPA assets | `bundleDependencies` |

**Build-time:** tsup bundles the CLI entry point (`src/main.ts`) into `dist/main.js`, inlining all JS dependencies the CLI imports (`commander`, `cli-table3`, `yaml`, `zod` via shared, `@commandgarden/shared`). Deps only used by the daemon/app child processes (`fastify`, `sql.js`, etc.) are not imported by the CLI and are tree-shaken out. This makes the CLI self-contained for `npm link` and global installs.

**Pack-time:** The `prepack` script (`scripts/prepare-bundle.mjs`) copies workspace packages into `cli/node_modules/@commandgarden/` so `npm pack` includes them via `bundleDependencies`.

**Install-time:** npm unpacks the bundled packages and installs their runtime dependencies (`fastify`, `sql.js`, etc.) from the registry normally. These deps are needed by the daemon and app child processes, not by the CLI bundle itself.

**Run-time:** The CLI resolves the daemon and app entry points via `createRequire` from `node_modules/@commandgarden/daemon` and `@commandgarden/app`.

---

## Prerequisites

- Node.js >= 20
- npm account with publish access to the `@commandgarden` scope
- Logged in: `npm login`

---

## Pre-publish checklist

- [ ] All tests pass: `npm test` (from monorepo root)
- [ ] All packages build: `npm run build` (from monorepo root)
- [ ] Version is bumped in `cli/package.json`
- [ ] `CHANGELOG.md` is updated (if maintained)
- [ ] Tarball contents look correct: `npm pack --dry-run` (from `cli/`)

---

## Publishing

### 1. Build all packages

```bash
cd commandGarden
npm install
npm run build
```

This builds in dependency order: `shared` -> `daemon` -> `cli` -> `chrome` -> `app`.

### 2. Verify the tarball

```bash
cd cli
npm pack --dry-run
```

Confirm the output includes:

```
dist/main.js                              (CLI bundle)
node_modules/@commandgarden/daemon/...    (daemon dist + package.json)
node_modules/@commandgarden/app/...       (app server + client assets)
node_modules/@commandgarden/shared/...    (shared dist + package.json)
```

Confirm it does NOT include `src/`, `*.test.ts`, or nested `node_modules/`.

### 3. Publish

```bash
npm publish --access public
```

For a dry run (no actual publish):

```bash
npm publish --access public --dry-run
```

### 4. Verify the install

```bash
# Install globally from npm
npm install -g @commandgarden/cli

# Verify
cg --version
cg daemon start
cg daemon status
cg daemon stop
```

---

## Version management

Follow [semver](https://semver.org/):

| Change type | Bump | Example |
|---|---|---|
| Breaking CLI interface change | major | Renamed commands, removed options |
| New feature, new command | minor | Added `cg audit export --format parquet` |
| Bug fix, dependency update | patch | Fixed `cg up` race condition |

Bump the version in `cli/package.json`:

```bash
cd cli
npm version patch   # or minor, or major
```

This updates `package.json` and creates a git tag.

---

## Troubleshooting

### `Cannot find @commandgarden/daemon entry point`

The bundled packages are missing. This usually means the `prepack` script did not run.

```bash
cd cli
node scripts/prepare-bundle.mjs   # manually stage bundled packages
npm pack --dry-run                 # verify they appear in the tarball
```

### Tarball is too large

Check that `daemon/package.json`, `app/package.json`, and `shared/package.json` all have `"files": ["dist"]`. Without this, source files and tests get bundled.

```bash
cd cli
npm pack --dry-run 2>&1 | head -50
```

### `prepack` fails with "dist not found"

Build all packages first:

```bash
cd commandGarden
npm run build
```

---

## Architecture notes

### Why `bundleDependencies`?

The daemon and app are private workspace packages that can't be installed from the npm registry. `bundleDependencies` is npm's built-in mechanism for shipping private packages inside a published package:

- The bundled packages are packed into the tarball at publish time
- At install time, they're unpacked from the tarball (not fetched from the registry)
- Their runtime dependencies (listed in the CLI's `dependencies`) are installed normally
- All runtime deps are pure JS/WASM (no native compilation required at install time)

### Why not bundle everything into one JS file?

The daemon and app run as **separate Node.js processes** (spawned via `child_process.spawn`). They can't be bundled into the CLI's main entry point because they need their own `node_modules/` for runtime imports (Fastify, sql.js, etc.).

Note: the CLI's own JS dependencies (commander, yaml, zod, etc.) ARE bundled into `dist/main.js` via tsup's `noExternal`. These same packages remain listed in `dependencies` because the daemon/app child processes need them installed in `node_modules/`.

### Dependency hoisting

The CLI's `dependencies` includes all runtime dependencies needed by the daemon, app, and shared packages:

```
CLI dependencies:
  cli-table3, commander              ← CLI's own deps (also bundled into dist/main.js)
  fastify, @fastify/websocket        ← daemon deps (external, needed at install time)
  @fastify/static                    ← app deps (external, needed at install time)
  sql.js                             ← daemon + app deps (pure WASM SQLite, no native build)
  yaml                               ← shared across all (bundled into CLI, installed for daemon/app)
  zod                                ← shared's dep (bundled into CLI, installed for daemon/app)
```

These are installed by npm at the top level, where Node's module resolution finds them when the daemon or app process imports them.

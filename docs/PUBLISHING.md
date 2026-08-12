# Publishing & Releasing

This guide covers the full release pipeline for commandGarden: version bump, native installer builds, GitHub Release creation, and npm publish.

---

## Quick Start

From the `installer/` directory on macOS:

```bash
./release.sh patch   # or minor, or major
```

This command:

1. Bumps the version in `src/cli/package.json`
2. Commits the bump and creates a git tag (`v<version>`)
3. Builds all workspace packages
4. Builds macOS installers (arm64 + x64 `.dmg`)
5. Builds the Windows installer (`.exe` via Docker/Inno Setup)
6. Prompts for confirmation before irreversible steps
7. Pushes the commit + tag to origin
8. Creates a GitHub Release with installer assets attached

Then publish to npm separately (requires browser-based MFA):

```bash
cd src/cli
npm publish --access public
```

---

## Prerequisites

- macOS 12+ (required for `pkgbuild` / `hdiutil`)
- Node.js >= 20 and npm
- GitHub CLI (`gh`) — authenticated (`gh auth login`)
- Docker Desktop — running (for Windows installer cross-compilation)
- `rsvg-convert` (`brew install librsvg`) — for macOS icon generation
- `rsvg-convert` + ImageMagick (`brew install librsvg imagemagick`) — for Windows `.ico` generation
- Xcode Command Line Tools (`xcode-select --install`)
- `npm login` — authenticated with publish access to the `@commandgarden` scope (for the npm publish step)

---

## Version Management

Follow [semver](https://semver.org/):

| Change type | Bump | Example |
|---|---|---|
| Breaking CLI interface change | major | Renamed commands, removed options |
| New feature, new command | minor | Added `cg audit export --format parquet` |
| Bug fix, dependency update | patch | Fixed `cg up` race condition |

---

## What Gets Released

Each release produces:

| Artifact | Channel | Audience |
|---|---|---|
| `@commandgarden/cli` on npm | npm registry | Developers with Node.js |
| `commandGarden-<ver>-arm64.dmg` | GitHub Release | macOS Apple Silicon users |
| `commandGarden-<ver>-x64.dmg` | GitHub Release | macOS Intel users |
| `commandGarden-<ver>-x64-setup.exe` | GitHub Release | Windows users |

---

## Release Notes

Auto-generated from git log between the previous tag and the new tag. Commits are grouped by conventional prefix:

- `feat:` → Features
- `fix:` → Fixes
- Everything else → Other Changes

An install section with npm and download instructions is appended automatically.

---

## Error Recovery

### Build fails before confirmation prompt

The version bump commit and tag are local-only. Undo with:

```bash
git reset --hard HEAD~1 && git tag -d v<version>
```

### npm publish fails

Same as above — nothing has been pushed to GitHub yet.

### GitHub Release fails after npm publish

The npm package is already published (irreversible). Create the release manually:

```bash
gh release create v<version> \
  --title "v<version>" \
  --notes "Release notes here" \
  installer/dist/commandGarden-<version>-arm64.dmg \
  installer/dist/commandGarden-<version>-x64.dmg \
  installer/dist/commandGarden-<version>-x64-setup.exe
```

---

## npm-Only Publish (Fallback)

If you need to publish to npm without building installers or creating a GitHub Release (e.g., urgent hotfix where installers aren't needed):

```bash
# 1. Bump version
cd src/cli
npm version patch --no-git-tag-version

# 2. Build
cd ../..
npm run build

# 3. Verify tarball
cd src/cli
npm pack --dry-run

# 4. Publish
npm publish --access public

# 5. Commit and tag
cd ../..
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('src/cli/package.json','utf8')).version)")
git add src/cli/package.json
git commit -m "chore: bump @commandgarden/cli to v${VERSION}"
git tag "v${VERSION}"
git push origin main "v${VERSION}"
```

---

## Architecture Notes

### How the npm package works

The CLI is a single published npm package that ships three private workspace packages **and their entire third-party production dependency tree** inside it (`"bundleDependencies": true`):

| Package | Role | Bundled via |
|---|---|---|
| `@commandgarden/shared` | Types, schemas, utilities | `bundleDependencies` + tsup `noExternal` (inlined into CLI bundle) |
| `@commandgarden/daemon` | Local HTTP/WS server (Fastify + SQLite) | `bundleDependencies` |
| `@commandgarden/app` | Web GUI server + SPA assets | `bundleDependencies` |
| Third-party runtime deps (zod, fastify, sql.js, ...) | Imported by the daemon/app child processes | `bundleDependencies` (physically copied into `cli/node_modules/` at pack time) |

**Build-time:** tsup bundles the CLI entry point (`src/main.ts`) into `dist/main.js`, inlining all JS dependencies the CLI imports. Deps only used by the daemon/app child processes are not imported by the CLI and are tree-shaken out.

**Pack-time:** The `prepack` script (`scripts/prepare-bundle.mjs`):
1. Copies the built workspace packages into `cli/node_modules/@commandgarden/`.
2. Copies the **resolved production dependency closure** straight out of the monorepo's root `node_modules/` (the exact, lockfile-pinned versions that were built and tested against) into `cli/node_modules/`. It reads the closure from `npm ls --omit=dev --all --parseable` and copies each top-level package recursively (private nested `node_modules/` come along). Nothing is resolved from the registry, so bundled versions can never drift from what was tested.

Combined with `"bundleDependencies": true`, `npm pack` then ships the entire runtime tree in the tarball. Because the copy is a resolved on-disk tree that is never re-resolved at install time, the script refuses to bundle any package declaring `os`/`cpu` constraints (a native/platform-specific dep would otherwise ship the publisher's-OS binary to every user).

**Install-time:** npm extracts the whole bundled tree. **Nothing is fetched from the registry** — the package is fully self-contained.

**Run-time:** The CLI resolves the daemon and app entry points via `createRequire` from `node_modules/@commandgarden/daemon` and `@commandgarden/app`.

### Why bundle the full dependency tree? (do NOT revert to a partial bundle)

The daemon and app are private workspace packages that can't be installed from the npm registry, so they must be bundled. But `bundleDependencies` has a sharp edge: npm treats **every dependency of a bundled package** as part of the bundle (`inBundle`). On a **global** install (`npm i -g`), npm does not fetch those deps from the registry — it only extracts what physically ships in the tarball. So if the third-party deps (zod, fastify, sql.js, ...) are *not* physically bundled, a global install produces **empty** `node_modules/zod`, `node_modules/fastify`, etc., and the daemon crashes at startup with `ERR_MODULE_NOT_FOUND`. (Local, non-global installs happen to work because hoisting sidesteps this — so the bug only shows up via `npm i -g`, which is how most users install the CLI.)

Bundling the entire production tree makes the tarball self-contained and avoids this failure mode entirely.

### Why not bundle everything into one JS file?

The daemon and app run as **separate Node.js processes** (spawned via `child_process.spawn`). They need their own `node_modules/` for runtime imports (Fastify, sql.js, etc.).

---

## Troubleshooting

### `Cannot find @commandgarden/daemon entry point`

The bundled packages are missing. The `prepack` script did not run:

```bash
cd src/cli
node scripts/prepare-bundle.mjs
npm pack --dry-run
```

### Tarball is large

This is expected up to a point: the CLI bundles its entire third-party **production** dependency tree (see Architecture Notes) so global installs are self-contained. Only production deps are bundled — the closure comes from `npm ls --omit=dev`, so build-time-only deps (React, Vite, etc.) are excluded. If the tarball is much larger than expected, check that build-only deps are declared in `devDependencies` (not `dependencies`) in each workspace package, and that `src/daemon/package.json`, `src/app/package.json`, and `src/shared/package.json` all have `"files": ["dist"]`.

### `cg up` fails with `ERR_MODULE_NOT_FOUND` after a global install

Symptom: `node_modules/zod` (or `fastify`, `sql.js`, ...) inside the installed CLI is an **empty directory**. Cause: the tarball was published *without* physically bundling the third-party dependency tree, so `npm i -g` created empty placeholders instead of fetching them. Fix: ensure `"bundleDependencies": true` and that `prepack` (`scripts/prepare-bundle.mjs`) copied the full prod tree from root `node_modules/` into `cli/node_modules/` before packing (run `npm install` at the monorepo root first so the closure exists). Verify with:

```bash
cd src/cli && npm pack
tar tzf commandgarden-cli-*.tgz | grep 'node_modules/zod/package.json'   # must print a match
```

Emergency workaround for an already-broken install (no republish): `cd "$(npm root -g)/@commandgarden/cli" && npm install --omit=dev`.

### `prepack` fails with "dist not found"

Build all packages first: `npm run build`

# Publishing & Releasing

This guide covers the full release pipeline for commandGarden: version bump, npm publish, native installer builds, and GitHub Release creation.

---

## Quick Start

From the `installer/` directory on macOS:

```bash
./release.sh patch   # or minor, or major
```

This single command:

1. Bumps the version in `src/cli/package.json`
2. Commits the bump and creates a git tag (`v<version>`)
3. Builds all workspace packages
4. Builds macOS installers (arm64 + x64 `.dmg`)
5. Builds the Windows installer (`.exe` via Docker/Inno Setup)
6. Prompts for confirmation before irreversible steps
7. Publishes `@commandgarden/cli` to npm
8. Pushes the commit + tag to origin
9. Creates a GitHub Release with installer assets attached

---

## Prerequisites

- macOS 12+ (required for `pkgbuild` / `hdiutil`)
- Node.js >= 20 and npm
- `npm login` — authenticated with publish access to the `@commandgarden` scope
- GitHub CLI (`gh`) — authenticated (`gh auth login`)
- Docker Desktop — running (for Windows installer cross-compilation)
- `rsvg-convert` (`brew install librsvg`) — for macOS icon generation
- `rsvg-convert` + ImageMagick (`brew install librsvg imagemagick`) — for Windows `.ico` generation
- Xcode Command Line Tools (`xcode-select --install`)

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

The CLI is a single published npm package that ships three private workspace packages inside it:

| Package | Role | Bundled via |
|---|---|---|
| `@commandgarden/shared` | Types, schemas, utilities | `bundleDependencies` + tsup `noExternal` (inlined into CLI bundle) |
| `@commandgarden/daemon` | Local HTTP/WS server (Fastify + SQLite) | `bundleDependencies` |
| `@commandgarden/app` | Web GUI server + SPA assets | `bundleDependencies` |

**Build-time:** tsup bundles the CLI entry point (`src/main.ts`) into `dist/main.js`, inlining all JS dependencies the CLI imports. Deps only used by the daemon/app child processes are not imported by the CLI and are tree-shaken out.

**Pack-time:** The `prepack` script (`scripts/prepare-bundle.mjs`) copies workspace packages into `cli/node_modules/@commandgarden/` so `npm pack` includes them via `bundleDependencies`.

**Install-time:** npm unpacks the bundled packages and installs their runtime dependencies from the registry normally.

**Run-time:** The CLI resolves the daemon and app entry points via `createRequire` from `node_modules/@commandgarden/daemon` and `@commandgarden/app`.

### Why `bundleDependencies`?

The daemon and app are private workspace packages that can't be installed from the npm registry. `bundleDependencies` is npm's built-in mechanism for shipping private packages inside a published package.

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

### Tarball is too large

Check that `src/daemon/package.json`, `src/app/package.json`, and `src/shared/package.json` all have `"files": ["dist"]`.

### `prepack` fails with "dist not found"

Build all packages first: `npm run build`

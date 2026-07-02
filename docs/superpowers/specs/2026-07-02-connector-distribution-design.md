# Bundling Connectors with the Published CLI

Design spec for shipping built-in connectors with `@commandgarden/cli` so a fresh `npm install` gives users a working set of connectors with zero setup, while keeping connector discovery deterministic (independent of launch directory or CWD).

---

## Context

Two related bugs were found and fixed in this area recently:

1. `openBrowser()` was missing `detached: true` on its spawn call, causing the browser tab to sometimes not open on Windows (fixed, shipped in `1.2.1`).
2. `daemon/src/config.ts`'s default `connectors.paths` included `'./connectors'`, resolved relative to the daemon process's CWD — which was never pinned, so `cg up` silently loaded a different (or empty) connector set depending on which directory it was launched from. Fixed by pinning the daemon's spawn `cwd` to `cgHome` and dropping the CWD-relative default (shipped in `1.2.2`).

That second fix made connector discovery *deterministic*, but exposed a separate gap: a genuinely fresh install (`npm install -g @commandgarden/cli` on a machine that has never run `cg` before) now deterministically loads **zero** connectors, because nothing populates `~/.commandgarden/connectors`. The two connectors that exist today (`teams/room-availability`, `timetracking/report`) live only in the monorepo's `commandGarden/connectors/` directory, which is not published.

**Decision (confirmed with user):** `@commandgarden/cli` stays on the public npm registry, and these connectors — including their internal Mercedes-Benz domain references — will be bundled directly into the published package. The disclosure trade-off was explicitly raised and accepted.

**Scope:** Make built-in connectors ship with the package and be discoverable immediately after install, without any manual copy step. Does not change the connector YAML format, the registry's loading logic, or the security/approval model.

---

## 1. Canonical Source Stays at Repo Root

`commandGarden/connectors/*.yaml` and `*.eval.js` remain the single source of truth — already referenced directly by `shared/src/connector-samples.test.ts` and `chrome/src/pipeline/connector-e2e.test.ts`. No files move.

## 2. `daemon/connectors/` Becomes a Build Artifact

New script `daemon/scripts/copy-connectors.mjs` (mirrors the existing `cli/scripts/prepare-bundle.mjs` pattern): clears and recreates `daemon/connectors/`, then copies `../connectors/*` (the repo-root canonical directory) into it.

`daemon/package.json`:
- `build` script becomes `tsc && node scripts/copy-connectors.mjs`.
- `files` array becomes `["dist", "connectors"]`.

Because `cli/scripts/prepare-bundle.mjs` already copies whatever is listed in each workspace package's `files` field into `cli/node_modules/@commandgarden/<pkg>/` for `bundleDependencies`, **no changes are needed to `prepare-bundle.mjs` itself** — adding `"connectors"` to `daemon/package.json`'s `files` is sufficient for it to flow through to the published tarball.

## 3. Discovery: Script-Relative Default Path

In `daemon/src/config.ts`, compute the bundled connectors directory relative to the compiled module's own location — not `process.cwd()`, not `homedir()`:

```typescript
import { fileURLToPath } from 'node:url';

const BUNDLED_CONNECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../connectors');
```

This resolves correctly in both contexts:
- Monorepo dev: `daemon/dist/config.js` → `daemon/connectors/` (populated by the build step above).
- Global install: `node_modules/@commandgarden/daemon/dist/config.js` → `node_modules/@commandgarden/daemon/connectors/` (populated by `bundleDependencies` at publish time).

Default `connectors.paths` becomes:

```typescript
paths: z.array(z.string()).default([BUNDLED_CONNECTORS_DIR, '~/.commandgarden/connectors']),
```

**Order matters.** `ConnectorRegistry.load()` iterates paths in array order and `Map.set()`s by `site/name` key, so later paths win on key collision. Bundled connectors load first; anything a user drops into `~/.commandgarden/connectors` with the same key overrides the bundled version. Users who explicitly set `connectors.paths` in their own `config.yaml` override the default entirely (existing behavior, unchanged) — they won't get the bundled path unless they add it back themselves. This is expected and will be documented.

## 4. Security Model Is Unaffected

Both existing connectors use `js_evaluate`, which is high-risk and gated by `security.approvedHighRisk`. Shipping them by default makes them *discoverable* (`cg list`, GUI Connectors page) but not *runnable* without explicit approval — no change to that gate.

## 5. Cleanup

The manual copy previously made into this user's own `~/.commandgarden/connectors` (a one-off workaround applied directly on their machine, not committed to the repo) becomes redundant once the bundled path ships, since it duplicates identical content. Left in place — harmless (same keys, same content, `~/.commandgarden/connectors` still wins by path order but with identical values) — no code or repo change required for this.

## 6. Testing Plan

| File | Coverage |
|---|---|
| `daemon/src/config.test.ts` (update) | Default `connectors.paths` includes a bundled-directory entry that is an absolute, resolvable path (not a bare relative string like `'./connectors'`). |
| `daemon/src/registry.test.ts` (update) | New case: `ConnectorRegistry` loads connectors from the computed bundled directory with no config file present at all, simulating a fresh install. |
| `daemon/scripts/copy-connectors.mjs` | Manual verification via `npm run build`: confirms `daemon/connectors/` is populated and matches `commandGarden/connectors/` contents. Covered indirectly by the `npm pack --dry-run` tarball-contents check already used before every publish (per `docs/PUBLISHING.md`). |

## 7. Non-Goals

- No `cg connectors install`/update command — this is a build-time bundling solution, not a runtime fetch mechanism.
- No versioning/sync story for connectors independent of the CLI's own version — connectors update exactly when the CLI is upgraded, same as any other bundled code.
- No change to the connector YAML schema, pipeline steps, or `ConnectorRegistry`'s public interface.
- No move to a private registry — the public-registry disclosure trade-off was explicitly accepted for this iteration.

# Research: Node.js SEA Maturity for Multi-Process Apps

**Issue:** [#17](https://github.com/samuelabc/command-garden/issues/17)  
**Date:** 2026-07-18  
**Context:** commandGarden spawns daemon and app as separate Node child processes via `child_process.spawn('node', [scriptPath])`. Can SEA replace the current npm tarball distribution?

---

## Executive Summary

Node.js Single Executable Applications (SEA) are **technically usable** for multi-process architectures, but **not a drop-in fit** for commandGarden's current design. SEA bundles **one embedded script per binary** (~70–140 MB each). Supporting CLI + daemon + app requires either **three platform-specific SEAs** or a **single binary with argv-based role dispatch** (re-executing `process.execPath`). Both paths need substantial build and runtime changes.

SEA remains **Stability 1.1 — Active development** (experimental) as of Node.js v26.5.0. There is no production-stability guarantee and no strategic initiative champion. **sql.js works in SEA** if the `.wasm` file is bundled as a SEA asset and wired through `locateFile`.

**Recommendation:** Do **not** adopt SEA for commandGarden's full multi-process distribution yet. Continue npm-based distribution. Revisit when VFS lands or if a CLI-only SEA (no daemon/app spawn) becomes a product goal.

---

## 1. Can a SEA binary spawn child SEA binaries?

### Finding: Yes, but there is no embedded “child Node runtime” — only full SEA binaries or shipped assets

Each SEA **is** a complete Node.js binary with one injected script blob. There is no API to spawn a “lightweight Node worker” from inside a SEA without shipping additional binaries.

### Mechanisms for multi-process SEA apps

| Approach | How it works | Fit for commandGarden |
|----------|--------------|----------------------|
| **Multiple SEA binaries** | Build `cg`, `cg-daemon`, `cg-app`; spawn by absolute path | Works; ~3× binary size; per-platform CI matrix |
| **Self-reexec via `process.execPath`** | Single SEA; top-level script dispatches on `argv` (`--daemon`, `--app`) | Possible; fork/argv bugs on Windows; monolithic bundle |
| **Bundle plain `node` as asset** | Extract `node` + `node_modules` at runtime ([makeSea pattern](https://medium.com/d-classified/a-practical-guide-to-creating-single-executable-applications-sea-in-node-js-0df7ab246bb6)) | Defeats “no Node installed” goal; fragile |
| **`child_process.fork()` default** | Defaults to `process.execPath` → re-runs **same** embedded main script | **Broken** for spawning helper `.js` files |

### Critical pitfall: `fork()` and `process.execPath`

In a SEA, `process.execPath` points to the SEA binary (e.g. `cg.exe`), not `node`. `child_process.fork(modulePath)` therefore launches **another full CLI session** instead of the helper script.

Production evidence: [google-gemini/gemini-cli#26365](https://github.com/google-gemini/gemini-cli/issues/26365) — SEA Windows build spawns a second Gemini session when dependencies call `fork()`. Workaround: detect forked children, find the `.js` target in `argv`, load via `Module.createRequire()`, and never fall through to main startup.

Additional Windows bug: [nodejs/node#62776](https://github.com/nodejs/node/issues/62776) — SEA + `cluster.fork()` injects `process.execPath` into worker `process.argv`, breaking argv-based routing.

### commandGarden today

```48:48:src/cli/src/commands/daemon-cmd.ts
    const child = spawn('node', [daemonScript], { detached: true, stdio: ['ignore', logFd, logFd], cwd: cgHome });
```

This assumes a system `node` and on-disk `daemonScript` with resolvable `node_modules`. A SEA distribution would need:

```js
spawn(daemonBinaryPath, [], { detached: true, ... })
// OR
spawn(process.execPath, ['--role', 'daemon'], { detached: true, ... })
```

**Sources:** [Node.js SEA docs — module loading](https://nodejs.org/api/single-executable-applications.html#module-loading-in-the-injected-main-script), [child_process.fork execPath](https://nodejs.org/api/child_process.html), [gemini-cli#26365](https://github.com/google-gemini/gemini-cli/issues/26365), [nodejs/node#62776](https://github.com/nodejs/node/issues/62776)

---

## 2. Does sql.js (WASM SQLite) work inside a SEA bundle?

### Finding: Yes, with explicit asset bundling — not out of the box

sql.js loads `sql-wasm.wasm` at runtime via Emscripten's `locateFile`. In SEA, the injected main script **cannot resolve modules from the filesystem** by default; `require()` / `import` only load built-ins unless the app is fully bundled or uses `createRequire`.

### Required pattern

1. Add WASM to SEA config `assets`:
   ```json
   {
     "assets": {
       "sql-wasm.wasm": "node_modules/sql.js/dist/sql-wasm.wasm"
     }
   }
   ```
2. At runtime, serve WASM from SEA memory:
   ```js
   const { getAssetAsBlob, isSea } = require('node:sea');
   const initSqlJs = require('sql.js');

   const config = isSea()
     ? { locateFile: () => URL.createObjectURL(getAssetAsBlob('sql-wasm.wasm')) }
     : {};
   const SQL = await initSqlJs(config);
   ```

### commandGarden impact

Both `AuditStore` and `AppStore` call `initSqlJs()` with **no** `locateFile`:

```19:19:src/daemon/src/audit-store.ts
    const SQL = await initSqlJs();
```

This works today because daemon/app run as normal Node processes with `node_modules/` on disk. **SEA packaging requires code changes** in daemon and app entry points.

No known Node.js core bugs specific to WASM-in-SEA. The general asset API (`sea.getAsset`, `getAssetAsBlob`, `getRawAsset`) is stable since v20.12 / v21.7.

**Sources:** [Node.js SEA assets](https://nodejs.org/api/single-executable-applications.html#assets), [Node.js sea.getAssetAsBlob](https://nodejs.org/api/single-executable-applications.html#seagetassetasblobkey-options)

---

## 3. Stability status in Node 22+

### Finding: Still experimental — not stabilized

| Indicator | Status (as of Node v26.5.0, Jul 2026) |
|-----------|----------------------------------------|
| API stability index | **1.1 — Active development** |
| `--experimental-sea-config` | **Stability 1 — Experimental** |
| Runtime warning | `ExperimentalWarning: Single executable application is an experimental feature` (suppressible via `disableExperimentalSEAWarning`) |
| Strategic initiative | **No champion** ([#55007](https://github.com/nodejs/node/issues/55007)) |
| VFS (needed for pkg-like bundling) | **Not implemented**; requirements doc exists, [FS hooks proposal #60021](https://github.com/nodejs/node/issues/60021) open |

### Version recommendations

| Node line | SEA support | Notes |
|-----------|-------------|-------|
| **22.x LTS** | Usable | `node:sea` API, `--experimental-sea-config`, postject workflow. **`--build-sea` explicitly not backported** (PR #61167 labeled `dont-land-on-v22.x`) |
| **24.x LTS** | Partial | `--build-sea` backport **pending** ([#62119](https://github.com/nodejs/node/issues/62119), PR [#62190](https://github.com/nodejs/node/pull/62190)) |
| **25.5+ / 26.x** | Best tooling | Native `--build-sea` (merged Jan 2026, [PR #61167](https://github.com/nodejs/node/pull/61167)) |

**Production use:** Acceptable for **internal/experimental CLI distribution** on pinned Node versions. **Not recommended** as the sole production distribution channel for a multi-process server product until stability ≥ 2.x and VFS ships.

**Critical constraint:** Blob generator Node version **must exactly match** the binary being injected. Mismatch can cause silent corruption ([#60327](https://github.com/nodejs/node/issues/60327)).

**Sources:** [Node.js SEA docs](https://nodejs.org/api/single-executable-applications.html), [joyeecheung SEA blog Jan 2026](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/), [nodejs/node#55007](https://github.com/nodejs/node/issues/55007)

---

## 4. Known limitations

### Size and startup

- **~70–142 MB per binary** (full Node.js runtime + blob). Three components ≈ **200–400 MB** total.
- Each spawned SEA process pays **full V8/Node startup cost** (~100–300 ms+ depending on bundle size and `useCodeCache`).
- Not a size optimization vs. containers; best for “single file, no Node installed” scenarios.

### Module and path semantics

- **One embedded script per binary**; dependencies must be pre-bundled (esbuild, rolldown, etc.) into a single file.
- **`require()` / `import` in injected script:** built-ins only unless bundled. Disk access via `module.createRequire()`.
- **`__dirname` / `__filename`:** equal to `process.execPath` and its directory — **not** the original source path.
- **`import()` + `useCodeCache`:** incompatible (dynamic import breaks).
- **`mainFormat: "module"` + `useSnapshot`:** incompatible.
- **No VFS:** cannot `require('fastify')` from embedded `node_modules` without bundling everything.

### Native modules

- No first-class addon support. Pattern: bundle `.node` as asset → write to temp → `process.dlopen()`.
- Linux arm64 Docker postject builds can break `dlopen` ([#59574](https://github.com/nodejs/node/issues/59574)).
- Windows: addon may require `win_delay_load_hook` in binding.gyp if SEA binary is not named `node.exe`.

### Platform and build

- CI-tested: Windows, Linux (not Alpine), macOS **arm64 only** (x64 skipped).
- **Per-platform builds required**; cross-compilation with `useCodeCache`/`useSnapshot` disabled only.
- macOS/Windows: code signing remove/re-sign after injection.
- Homebrew Node on macOS can break SEA fuse detection ([#63126](https://github.com/nodejs/node/issues/63126)); use official Node builds.

### Runtime configuration

- `NODE_OPTIONS` can alter SEA behavior unless `execArgvExtension: "none"` (fixed in [#59560](https://github.com/nodejs/node/pull/59560)).
- `execArgv` in config bakes Node flags into the binary.

**Sources:** [Node.js SEA docs](https://nodejs.org/api/single-executable-applications.html), [KruN production pitfalls](https://krun.pro/node-js-sea-what/), [codewithnodejs SEA guide](https://codewithnodejs.com/ship-a-node-js-app-as-a-single-executable/)

---

## 5. Production examples of multi-process SEA server apps

### Finding: Very few; closest is Gemini CLI (with significant workarounds)

| Project | Pattern | Multi-process? |
|---------|---------|----------------|
| **[Google Gemini CLI](https://github.com/google-gemini/gemini-cli)** | SEA for Windows distribution | Yes — hits `fork()` / spawn bugs ([#26365](https://github.com/google-gemini/gemini-cli/issues/26365)) |
| **[makeSea](https://medium.com/d-classified/a-practical-guide-to-creating-single-executable-applications-sea-in-node-js-0df7ab246bb6)** | Self-extracting SEA bundling `node.zip` + `node_modules` | Build-time multi-process; runtime extracts deps |
| **[Dunqing/nodesea](https://github.com/Dunqing/nodesea)** | Rust SEA builder (rolldown bundling) | Tooling, not an app |
| **[@getlarge/nx-node-sea](https://www.npmjs.com/package/@getlarge/nx-node-sea)** | Nx plugin for SEA builds | Tooling |

No well-documented open-source **Fastify/daemon + app server** stack running entirely as SEA was found. The Gemini CLI case is the strongest real-world signal that **multi-process SEA requires custom spawn/fork handling**.

Vercel deprecated `pkg` pointing users to Node SEA, but `pkg` supported virtual filesystem and multi-file bundles — feature parity is **not** there yet ([#53476](https://github.com/nodejs/node/issues/53476)).

---

## 6. `--experimental-sea-config` workflow complexity

### Legacy workflow (Node 20–24, still supported)

1. Bundle app to single JS (esbuild `--bundle --platform=node --format=cjs`)
2. Write `sea-config.json` with `main`, `output` (blob path), optional `assets`, `useCodeCache`
3. `node --experimental-sea-config sea-config.json` → generates blob
4. Copy `node` binary to target name
5. Remove code signature (macOS/Windows)
6. `npx postject <binary> NODE_SEA_BLOB <blob> --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2` (+ `--macho-segment-name NODE_SEA` on macOS)
7. Re-sign (macOS/Windows)

**Complexity:** Moderate–high. Requires postject, platform-specific signing steps, pinned Node version, and a CI matrix (Linux x64, macOS arm64, Windows x64).

### Modern workflow (Node ≥ 25.5)

```bash
echo '{ "main": "dist/bundle.js", "output": "cg" }' > sea-config.json
node --build-sea sea-config.json
codesign --sign - cg   # macOS
./cg
```

**Complexity:** Low for a **single** binary. Still need bundler step + per-platform builds + signing. Does **not** simplify the multi-binary or role-dispatch architecture problem.

**Sources:** [Node.js SEA docs — build-sea](https://nodejs.org/api/single-executable-applications.html#generating-single-executable-applications-with---build-sea), [PR #61167](https://github.com/nodejs/node/pull/61167), [joyeecheung blog](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/)

---

## Recommendation for commandGarden

### Verdict: **Not viable near-term** for full multi-process distribution

| Requirement | SEA readiness |
|-------------|---------------|
| Spawn daemon + app without system Node | Needs 3 SEAs or monolithic re-exec |
| sql.js (WASM) | Achievable with asset + code change |
| Fastify + app server bundling | Achievable but large bundles; no VFS |
| npm install simplicity | Current approach is simpler |
| Production stability | SEA still experimental |
| Binary size | Worse than npm tarball (~3× 80 MB vs. ~few MB JS) |

### If pursued later, least-bad architecture

**Option A — Three SEA binaries (recommended if SEA is required):**

```
cg          → CLI bundle (spawns cg-daemon, cg-app by path beside exec)
cg-daemon   → daemon bundle + sql-wasm.wasm asset
cg-app      → app bundle + sql-wasm.wasm asset + static assets
```

- Ship all three in a zip/tar or install dir.
- Replace `spawn('node', [script])` with `spawn(join(dirname(process.execPath), 'cg-daemon'), [])`.
- Patch sql.js init in daemon/app.
- CI: 3 × 3 platforms = 9 build artifacts.

**Option B — Single SEA with role dispatch:**

- One esbuild bundle with CLI + daemon + app code paths.
- `spawn(process.execPath, ['__daemon__'])` with argv normalization (filter execPath tokens on Windows).
- Avoid `fork()` or patch all transitive fork callers.
- Largest binary; hardest to maintain.

### Suggested path forward

1. **Keep npm `@commandgarden/cli` as primary distribution** (already handles multi-process correctly).
2. **Optional future spike:** CLI-only SEA for environments that only need `cg` commands without daemon/app — much simpler scope.
3. **Track [nodejs/single-executable](https://github.com/nodejs/single-executable)** VFS progress ([#60021](https://github.com/nodejs/node/issues/60021)) — would reduce bundling pain significantly.
4. **Pin Node 24 LTS** once `--build-sea` backport lands if experimenting.

---

## References

- [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html)
- [Node.js single-executable initiative / VFS requirements](https://github.com/nodejs/single-executable/blob/main/docs/virtual-file-system-requirements.md)
- [Improving SEA Building (Joyee Cheung, Jan 2026)](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/)
- [PR #61167 — --build-sea](https://github.com/nodejs/node/pull/61167)
- [Issue #62119 — backport to v24.x](https://github.com/nodejs/node/issues/62119)
- [Gemini CLI SEA fork bug #26365](https://github.com/google-gemini/gemini-cli/issues/26365)
- [SEA + cluster argv bug #62776](https://github.com/nodejs/node/issues/62776)
- [SEA stability question #55007](https://github.com/nodejs/node/issues/55007)
- [commandGarden PUBLISHING.md](../../docs/PUBLISHING.md) — current multi-process rationale

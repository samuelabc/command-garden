# TODO

## commandGarden

- [x] Plan 1: Shared types — implemented on `feat/commandgarden-shared` (97 tests, all passing)
- [x] Plan 2: Daemon — implemented on `feat/commandgarden-daemon` (50 tests, all passing)
- [x] Plan 3: Chrome extension — implemented on `feat/commandgarden-chrome` (52 tests, all passing)
- [x] Plan 4: CLI client — implemented on `feat/commandgarden-cli` (60 tests, all passing)
- [x] Plan 5: Sample connector — implemented on `feat/commandgarden-connectors` (16 new tests, 279 total, all passing)
- [x] README — `commandGarden/README.md` with usage guide, happy-flow samples, and ASCII architecture diagram
- [x] Bugfix: "Dynamic require of events is not supported" — added `createRequire` banner shim to `cli/tsup.config.ts`
- [x] Bugfix: Replace `better-sqlite3` (native C++ addon) with `sql.js` (pure WASM) — fixes `npm install -g` failure on systems without C++ build tools
- [x] Publish `@commandgarden/cli@1.1.4` to npm (patch: added `sql.js` type declarations for daemon/app builds)
- [x] Bundle connectors with published CLI — `@commandgarden/cli@1.2.3` ships built-in connectors, zero-setup fresh install (88 daemon tests, 114 cli tests, all passing)
- [x] TokenMaster `clients-list` connector — first declarative `cookie_read` + `fetch` connector (no `.eval.js`), 131 shared tests passing
- [x] Bugfix: Map step `${{ row.field }}` resolved to `undefined` — added `row` as top-level scope in `PipelineContext.applyMap` (92 chrome tests, 131 shared tests passing)
- [x] Connector Authoring Guide — `docs/connector-authoring.md` with pipeline patterns, debugging techniques, and common pitfalls
- [x] Code review fixes — formalized `row` in `ExprContext`, removed fragile connector count assertion, added missing-field edge-case test, cleaned up stray `yarn.lock`, improved docs
- [x] Wiz blog security connector (`wiz/blog-security`) — Next.js `__NEXT_DATA__` extraction pattern, 13 posts, documented Pattern 4 + IIFE pitfall in `docs/connector-authoring.md`
- [x] Bugfix: `cg up` ERR_MODULE_NOT_FOUND for `turndown` on Windows — added `realpathSync` to `resolveScript` so Windows junctions from `npm link` resolve to the real monorepo path (107 CLI tests passing)
- [x] Enhanced "Why commandGarden" page — SVG architecture diagram, before/after flow visualization, colored Badge comparison tables, 2-column security grid with icons, category-tagged Built-in Apps grid, step-numbered Happy Path, scrollspy sub-navigation, visual rhythm with background bands
- [x] Categorized Apps navigation — sidebar "Apps" section split into three sub-groups (Administrative, Productivity, Security) with inline sub-labels; Overview page tags updated to match
- [x] Overview.tsx writing review (humanizer pass) — deduplicated redundant claims (credentials/tokens/local ×4 each), removed overlapping Section 2 table, replaced clichés (hit a wall, heavy lifting, tokens burned), renamed Happy Path → Typical Workflow, softened unsubstantiated token numbers, reworked "What we don't do" → real Limitations section, fixed em dashes, synonym cycling, negative parallelism, cleaned unused import

See `TODO_ARCHIVE.md` for completed work.

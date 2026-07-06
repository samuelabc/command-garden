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

See `TODO_ARCHIVE.md` for completed work.

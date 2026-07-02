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

See `TODO_ARCHIVE.md` for completed work.

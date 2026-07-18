## Learned User Preferences

- Place code packages (`app`, `cli`, `chrome`, `daemon`, `shared`) under `src/`; keep `docs/`, `skills/`, and `connectors/` at the repo root.

## Learned Workspace Facts

- npm monorepo at repo root with workspaces: `src/shared`, `src/daemon`, `src/cli`, `src/chrome`, `src/app`.
- Publish the CLI as `@commandgarden/cli` from `src/cli/` per `docs/PUBLISHING.md`.
- Root `connectors/` holds built-in YAML connectors; the daemon build copies them to `src/daemon/connectors/` (gitignored artifact).
- Root `skills/` holds agent skills; bundled into the CLI tarball via `src/cli/scripts/prepare-bundle.mjs` at publish time.
- Build order: shared → daemon → cli → chrome → app (`npm run build` from root).

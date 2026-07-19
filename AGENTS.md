## Learned User Preferences

- Place code packages (`app`, `cli`, `chrome`, `daemon`, `shared`) under `src/`; keep `docs/`, `skills/`, and `connectors/` at the repo root.

## Learned Workspace Facts

- npm monorepo at repo root with workspaces: `src/shared`, `src/daemon`, `src/cli`, `src/chrome`, `src/app`.
- GitHub remote is `samuelabc/command-garden`.
- Publish the CLI as `@commandgarden/cli` from `src/cli/` per `docs/PUBLISHING.md`.
- Runtime requires Node.js >= 20; `cg` spawns the daemon and app GUI as separate Node child processes.
- Root `connectors/` holds built-in YAML connectors; the daemon build copies them to `src/daemon/connectors/` (gitignored artifact).
- Root `skills/` holds agent skills; `src/cli/scripts/prepare-bundle.mjs` copies them into the bundled app and strips the `files` field from bundled dependency `package.json` files so npm includes `skills/` in the CLI tarball.
- Build order: shared → daemon → cli → chrome → app (`npm run build` from root).

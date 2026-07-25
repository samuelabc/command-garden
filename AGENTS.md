## Learned User Preferences

- Place code packages (`app`, `cli`, `chrome`, `daemon`, `shared`) under `src/`; keep `docs/`, `skills/`, and `connectors/` at the repo root.
- Author new built-in connectors using `skills/connector-authoring/SKILL.md` (and `RECON-PLAYBOOK.md` when needed).
- When adding built-in connectors, update `README.md` and `skills/cg/SKILL.md` (connector table, usage section, and CLI-from-source examples).
- Timetracking GUI: keep goal summary stats always visible; collapse the monthly calendar by default.
- News feed pages (AI News, Security News): show article summaries by default, not only on hover.
- Keep Chrome extension publishing documentation in `docs/chrome-web-store.md`, not in `docs/PUBLISHING.md`.

## Learned Workspace Facts

- npm monorepo at repo root with workspaces: `src/shared`, `src/daemon`, `src/cli`, `src/chrome`, `src/app`.
- GitHub remote is `samuelabc/command-garden`; publish the CLI as `@commandgarden/cli` from `src/cli/` per `docs/PUBLISHING.md`; public npm README at `src/cli/README.md` (root README is contributor/internal-facing). GitHub Releases via `installer/release.sh` (version bump, builds, macOS `.dmg` + Windows `.exe`, push, `gh release create`); npm publish is a separate manual step (`cd src/cli && npm publish`) because npm requires browser MFA.
- Runtime requires Node.js >= 20; `cg` spawns the daemon and app GUI as separate Node child processes.
- Root `connectors/` holds built-in YAML connectors (daemon build copies to `src/daemon/connectors/`, gitignored); root `skills/` holds agent skills bundled into the CLI via `src/cli/scripts/prepare-bundle.mjs` and into the macOS installer at `app/app/skills/` via `installer/assemble.sh`.
- Build order: shared → daemon → cli → chrome → app (`npm run build` from root).
- Built-in connector files are `{site}-{name}.yaml` (plus optional `.eval.js`) in root `connectors/`; runtime id is `{site}/{name}`.
- Capability model (`src/shared/src/capabilities.ts`): 10 capabilities; high-risk (`js_evaluate`, `cdp_attach`, `state_mutate`, `network_egress`) require per-capability approval via `cg config approve {site}/{name} <capability> [...]` (stored as `security.approvedHighRisk` map).
- App GUI (`src/app/`) uses a brutalist design system: zero border-radius, DaisyUI on Tailwind, Space Grotesk headings (`font-display`), JetBrains Mono data (`font-mono`), green primary accent.
- GUI connector apps register built-in connectors in `src/app/src/server/routes/connectors.ts` `APP_ROUTES` (connector id → app route); Security News and AI News pages call `api.run()` directly for multiple sources instead.
- Connector authoring: declarative `map` cannot flatten arrays of objects (omit or use `js_evaluate`); Substack sites expose archive JSON at `https://{subdomain}.substack.com/api/v1/archive`.
- Connector `domains` are enforced at load-time and runtime (domain-guard in pipeline runner); `js_evaluate` egress uses `network_egress` + declarativeNetRequest session rules.
- Non-technical distribution: embedded Node binary + native installers in `installer/` (macOS `.pkg`/`.dmg`; Windows per-user Inno Setup `.exe` cross-compiled via Docker on macOS); Node SEA not viable for multi-process spawn; extension builds to `src/chrome/dist/` via `src/chrome/build.mjs`.

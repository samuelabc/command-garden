# commandGarden

Enterprise browser automation that turns websites into secure, auditable CLI commands using declarative YAML connectors.

commandGarden reuses your existing Chrome sessions — no credentials are stored or transmitted. Every command is validated against declared domains and capabilities, and every execution is logged to a local audit trail.

For the full design spec, see [`docs/superpowers/specs/2026-06-23-commandgarden-design.md`](../docs/superpowers/specs/2026-06-23-commandgarden-design.md).

---

## Architecture

```
┌─────────────┐                 ┌──────────────┐                 ┌───────────────────┐
│  CLI Client  │      HTTP      │    Daemon    │    WebSocket    │  Chrome Extension  │
│  (Node.js)   │ ─────────────→ │  (Fastify)   │ ←────────────→ │  (MV3, TypeScript) │
└─────────────┘  localhost:19825└──────────────┘                 └───────────────────┘
                                       ↑                                │
┌─────────────┐      HTTP              │                                │
│  GUI (React) │ ─→ ┌──────────────┐   │  Relay commands via HTTP       │  Execute pipeline
│  SPA         │    │  App Server  │ ──┘                                │  steps on page
└─────────────┘    │  (Fastify)   │                                    │
                    │  :19826      │                                    │
                    └──────────────┘                                    │
                           │                                           │
                     ┌──────────┐          ┌──────────────┐            │
                     │  App DB  │          │  Audit Log   │            │
                     │ (SQLite) │          │  (SQLite)    │            │
                     └──────────┘          └──────────────┘            │
```

**Data flow:** CLI or GUI sends a command → Daemon validates auth, domains, and capabilities → Daemon relays to the Chrome Extension via WebSocket → Extension runs the connector's pipeline steps on the target page → Structured data flows back through the Daemon to the CLI or GUI.

The **App Server** (`:19826`) is the GUI's backend — it proxies daemon calls, enriches responses, and owns app-specific state (preferences, saved views). The GUI never talks to the daemon directly.

---

## Prerequisites

- **Node.js** >= 20
- **npm** >= 9 (with workspaces support)
- **Chrome** or **Chromium** (for sideloading the extension)

---

## Installation

### From npm (recommended)

```bash
npm install -g @commandgarden/cli
```

This makes both `commandgarden` and the shorthand `cg` available globally.

### From source

```bash
# From the commandGarden/ directory
npm install
npm run build

# Link globally so 'cg' and 'commandgarden' are available on PATH
npm link --workspace=cli
```

Build compiles all five workspace packages in dependency order: `shared` → `daemon` → `cli` → `chrome` → `app`.

---

## Setup

### 1. Quick start (daemon + GUI)

```bash
cg up
```

This starts the daemon, starts the GUI app server, and opens the browser to `http://127.0.0.1:19826`. To stop everything: `cg down`.

### 1b. Start components individually

```bash
# Daemon only
cg daemon start

# GUI only (requires daemon)
cg gui --background

# Or directly (from source builds)
node daemon/dist/main.js
node app/dist/server/main.js
```

The daemon binds to `127.0.0.1:19825` by default and writes a session token to `~/.commandgarden/session-token`. The GUI app server binds to `127.0.0.1:19826` (configurable via `app.port` in config.yaml).

### 2. Load the Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `commandGarden/chrome/dist/` directory

The extension's service worker will connect to the daemon via WebSocket on `ws://127.0.0.1:19825`.

### 3. Verify

```bash
cg daemon status
```

Expected output:

```
Daemon is running on http://127.0.0.1:19825
```

---

## Web GUI

The GUI provides a browser-based interface at `http://127.0.0.1:19826` with:

- **Dashboard** — system health cards (daemon, extension, connectors) and recent activity
- **Connectors** — browse all connectors with approval status badges, inline approve action for high-risk connectors, run any connector via an auto-generated form
- **App pages** — dedicated UI for Time Tracking (month picker, summary cards, grouped-by-project table) and Room Availability (room combobox, timeline bar)
- **Audit Log** — filterable, paginated event viewer with expandable pipeline step detail
- **Configuration** — task-oriented settings page with Server, Connector Security (per-connector approval table with toggles), Connector Sources, Audit & Retention, and Output sections; includes a raw YAML editor and sticky save bar with dirty tracking
- **Setup Guide** — interactive checklist with live status polling

Start with `cg up` or `cg gui`. For the full design spec, see [`docs/superpowers/specs/2026-07-01-commandgarden-gui-design.md`](../docs/superpowers/specs/2026-07-01-commandgarden-gui-design.md).

---

## Happy Flow: Running a Connector

### List available connectors

```bash
cg list
```

```
CONNECTOR                  ACCESS  DOMAINS                      CAPABILITIES
timetracking/report        read    timetracking.mercedes…       navigate, js_evaluate
teams/room-availability    read    outlook.cloud.microsoft.…    navigate, js_evaluate
```

### Timetracking report

```bash
cg run timetracking/report --month 2026-06 --format json
```

This connector navigates to the timetracking portal, fetches the monthly report API using your existing browser session cookies, and returns structured booking data.

> **Note:** This connector uses `js_evaluate` (a high-risk capability) and must be approved before first use — see [Approving high-risk connectors](#approving-high-risk-connectors).

### Room availability (Teams/Outlook)

```bash
# By room name
cg run teams/room-availability --room "MBTMY The Vista" --format json

# By room email
cg run teams/room-availability --room "RES-RERE-M6VJ7ZUW@mercedes-benz.com" --date 2026-06-18 --format table
```

This connector drives the Outlook Scheduling Assistant in your authenticated browser session to fetch a meeting room's free/busy timeline for a given day. It intercepts the page's own GraphQL `getSchedule` call (the endpoint rejects replayed requests) and returns time blocks with state (`free`, `busy`, `tentative`, `oof`, `elsewhere`), start/end times, and duration.

> **Note:** This connector uses `js_evaluate` (a high-risk capability) and must be approved before first use — see [Approving high-risk connectors](#approving-high-risk-connectors).

---

## Writing a Custom Connector

Create a YAML file in `connectors/` (built-in) or `~/.commandgarden/connectors/` (user-defined):

```yaml
site: mysite
name: my-command
version: "1.0"
description: "Short description of what this connector does"
access: read

domains:
  - "mysite.example.com"
capabilities:
  - navigate
  - dom_read

args:
  - name: query
    type: string
    required: true
    help: "Search query"

columns:
  - name: title
    type: string
  - name: url
    type: string

pipeline:
  - step: navigate
    url: "https://mysite.example.com/search?q=${{ args.query }}"
  - step: wait
    selector: ".results"
    timeout: 5000
  - step: extract
    selector: ".results .item"
    fields:
      title: "h3"
      url: "a@href"
```

Validate before use:

```bash
cg validate connectors/my-connector.yaml
```

### Available pipeline steps

| Step | Purpose | Required capability |
|---|---|---|
| `navigate` | Open a URL | `navigate` |
| `wait` | Wait for a selector or timeout | `navigate` |
| `extract` | Read data from DOM elements | `dom_read` |
| `click` | Click an element | `dom_write` |
| `type` | Type text into an input | `dom_write` |
| `intercept` | Capture a network response body | `intercept_response` |
| `cookie` | Read cookies for a domain | `cookie_read` |
| `fetch` | HTTP request from page context | `cookie_read` |
| `map` | Transform/rename extracted fields | none |
| `filter` | Filter rows by condition | none |
| `set` | Set a variable for later steps | none |

### Expression syntax

Use `${{ }}` for template expressions (no JS eval):

- **Variable access:** `args.month`, `vars.token`, `cookies.name`
- **String concatenation:** `"Bearer " + vars.token`
- **Pipe filters:** `args.month | default("2026-06")`, `value | number`, `text | trim`

---

## Audit Log

Every command execution is logged to `~/.commandgarden/audit.db` (SQLite). The audit log records what was accessed and row counts, never actual data values. Sensitive argument values (matching `token`, `password`, `secret`, `api_key`, `credential`, `auth`) are automatically redacted.

### Event types

| Type | When logged |
|---|---|
| `command.start` | Before pipeline execution begins |
| `command.success` | Pipeline completed successfully |
| `command.error` | Pipeline failed |
| `command.denied` | Validation rejected (unapproved domain, missing capability) |
| `auth.failed` | Invalid token or missing CSRF header |
| `approval.granted` | Step approval was approved (from CLI or extension) |
| `approval.rejected` | Step approval was rejected |
| `config.changed` | Configuration value was changed via `cg config set` |

Each command execution is linked by a **correlation ID** across its start, success/error, and any approval events. A **connector hash** (SHA-256 of the YAML file) is recorded so changes to connectors between runs are visible in the audit trail.

### Querying events

```bash
# List recent events
cg audit list --since 7d

# Filter by connector
cg audit list --since 30d --connector timetracking/*

# Filter by event type
cg audit list --type auth.failed --since 7d
cg audit list --type command.denied --since 30d

# Show full details of a single event (including pipeline steps)
cg audit show <event-id>

# Export as JSON
cg audit export --format json --since 30d

# Export as CSV (includes all fields)
cg audit export --format csv --since 30d
```

### Pipeline step visibility

Successful and failed command events include a `steps` array showing each pipeline step that executed, with its type, capability, duration, and any error. Use `cg audit show <id>` to see the step-by-step breakdown:

```
Pipeline Steps:
  #  Step         Capability          Duration  Error
  1  navigate     navigate            320ms
  2  wait         navigate            450ms
  3  js_evaluate  js_evaluate         280ms
  4  map          -                   2ms
```

### Security features

- **Audit-or-fail**: Commands are blocked if the audit system is unavailable (disk full, corruption)
- **File permissions**: `audit.db` is created with `0600` permissions (owner-only read/write)
- **Denial logging**: Blocked commands log `command.denied` with the denial reason
- **Auth failure logging**: Invalid tokens and missing CSRF headers are logged as `auth.failed`
- **Config change tracking**: All `cg config set` mutations are logged with old and new values

---

## Configuration

Stored at `~/.commandgarden/config.yaml`. Created automatically with defaults on first daemon start.

```yaml
daemon:
  port: 19825
  host: "127.0.0.1"

security:
  extensionId: ""
  highRiskCapabilities:
    - js_evaluate
    - cookie_write
  approvedHighRisk: []

connectors:
  paths:
    - "./connectors"
    - "~/.commandgarden/connectors"

audit:
  retentionDays: 90
  dbPath: "~/.commandgarden/audit.db"

output:
  defaultFormat: table
```

Manage via CLI:

```bash
cg config show
cg config set daemon.port 9999
cg config set audit.retentionDays 180
```

Configuration can also be edited in the GUI at the **Configuration** page, which provides task-oriented sections with validation, a connector security table with per-connector approval toggles, and a raw YAML editor. Changes that affect the daemon host or port show a restart banner.

### Approving high-risk connectors

Connectors that use `js_evaluate` or `cookie_write` are classified as **high-risk** and blocked by default. There are three ways to approve a connector:

1. **GUI — Configuration page:** Toggle the "Approved" switch in the Connector Security table
2. **GUI — Connectors page:** Click the "Approve" button next to any blocked connector
3. **CLI / config file:** Add its key (`site/name`) to `security.approvedHighRisk` in `~/.commandgarden/config.yaml`:

```yaml
security:
  approvedHighRisk:
    - "timetracking/report"
    - "teams/room-availability"
```

If a high-risk connector is not approved, running it will return:

```
Error: Connector "<key>" uses high-risk capabilities [js_evaluate] but is not approved
```

### Step approval (confirmation gate)

Pipeline steps can be configured to require user approval before execution. This is useful for sensitive operations — each step pauses and waits for confirmation before proceeding.

**Configuration** is per-capability in `~/.commandgarden/config.yaml`:

```yaml
security:
  approvalRequired:
    - js_evaluate
    - dom_write
  autoApproveConnectors:
    - "timetracking/report"
  approvalTimeoutMs: 120000
```

- **`approvalRequired`** — list of capabilities that require user confirmation. Any pipeline step using one of these capabilities will pause for approval.
- **`autoApproveConnectors`** — list of trusted connector keys (`site/name`) that skip approval entirely.
- **`approvalTimeoutMs`** — how long to wait for approval before aborting (default: 120s).

**How it works:**

When a pipeline hits a step requiring approval, the user is prompted simultaneously in two places:

1. **CLI terminal** — a `y/n` prompt appears inline:
   ```
   ⚠  Step 3 [js_evaluate] in teams/room-availability requires approval.
      Capability: js_evaluate
      js_evaluate step (requires js_evaluate)
      Approve? (y/n):
   ```

2. **Chrome extension** — a notification with **Approve** / **Reject** buttons.

Whichever surface responds first resolves the approval. If rejected, the entire pipeline aborts. Multiple concurrent pipelines are supported without conflict — each approval is tracked by a unique ID.

---

## Running Tests

```bash
# All workspaces
npm test

# Individual packages
npm test -w shared
npm test -w daemon
npm test -w cli
npm test -w chrome
npm test -w app
```

---

## Publishing

The CLI is published as a single npm package. The `@commandgarden/shared` workspace is bundled into the CLI at build time via `tsup`, so only one package needs to be published.

```bash
npm run build
cd cli && npm publish --access public
```

### Known limitation: daemon and app resolution

The CLI declares `@commandgarden/daemon` and `@commandgarden/app` as dependencies so that `createRequire` can resolve them when the CLI is globally linked from the monorepo (`npm link --workspace=cli`). This works for local development.

For publishing to npm, additional work is needed — the daemon and app are `private: true` packages that won't be resolved from the registry. Options to address this:

1. **`bundleDependencies`** — add `"bundleDependencies": ["@commandgarden/daemon", "@commandgarden/app"]` to the CLI's `package.json` and re-declare their transitive dependencies (`better-sqlite3`, `fastify`, etc.) in the CLI's own `dependencies`
2. **Meta-package** — create a `@commandgarden/commandgarden` wrapper package that orchestrates installation
3. **Full bundling** — bundle daemon and app server entry points into the CLI's `dist/` via tsup (complex due to native deps like `better-sqlite3`)

---

## Development

### Building

```bash
# From the commandGarden/ directory
npm install
npm run build          # all workspaces: shared → daemon → cli → chrome → app

# Or build individual packages
npm run build -w shared
npm run build -w daemon
npm run build -w cli
npm run build -w chrome
npm run build -w app
```

### Starting the daemon (without `cg`)

During development, the `cg` CLI may not be globally linked. Start the daemon directly:

```bash
# After building
node daemon/dist/main.js
```

Or using the workspace script:

```bash
npm start -w daemon
```

The daemon will:
- Bind to `127.0.0.1:19825`
- Write a session token to `~/.commandgarden/session-token`
- Load connectors from `./connectors` and `~/.commandgarden/connectors`

To verify it's running, hit the status endpoint:

```bash
curl http://127.0.0.1:19825/api/status
```

### Running the CLI from source (without global link)

```bash
node cli/dist/main.js daemon status
node cli/dist/main.js list
node cli/dist/main.js run teams/room-availability --room "MBTMY The Vista" --format json
node cli/dist/main.js run timetracking/report --month 2026-06 --format json
```

### Linking globally (optional)

To make `cg` / `commandgarden` available on PATH:

```bash
npm link --workspace=cli
```

After linking, use `cg` commands as documented in the [Setup](#setup) section.

### GUI development

```bash
cd app && npm run dev
```

This starts Vite (HMR on `:5173`) and the app server (`tsx watch`) concurrently. The Vite dev server proxies `/api` requests to the app server on `:19826`.

### Watch mode for tests

```bash
npm run test:watch -w daemon    # re-runs on file changes
npm run test:watch -w chrome
npm run test:watch -w app
```

---

## Project Structure

```
commandGarden/
  shared/        Shared types — connector schema (Zod), protocol messages,
                 audit events, expression parser, pipeline definitions
                 (bundled into CLI at build time, not published separately)
  daemon/        Local HTTP + WebSocket server (Fastify) — auth token
                 management, connector registry, capability validation,
                 audit store (SQLite), WebSocket relay to extension
  cli/           CLI client (Commander.js) — run, list, inspect, validate,
                 daemon management, GUI management, audit queries, config
                 Published as @commandgarden/cli on npm
  chrome/        Chrome MV3 extension — service worker, content scripts,
                 domain guard, pipeline step execution engine
  app/           Web GUI — Fastify app server (facade endpoints, SQLite
                 store for preferences/views) + React SPA (Vite, Tailwind,
                 DaisyUI) with 8 pages including custom app pages for
                 timetracking and room availability
  connectors/    Built-in YAML connector definitions
  package.json   Workspace root (npm workspaces)
```

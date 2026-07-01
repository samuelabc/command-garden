# commandGarden GUI

A web-based graphical interface for commandGarden, built as a new `app/` workspace in the monorepo. The GUI lets internal team members run connectors, browse audit logs, manage configuration, and use dedicated app pages for timetracking and room availability — without touching the terminal.

## Architecture

Three-tier separation:

```
GUI (React SPA)  →  App Server (Fastify, :19826)  →  Daemon (:19825)  →  Chrome Extension
                          ↓
                    App DB (SQLite)
```

The **daemon** is infrastructure. It runs connectors, logs audits, manages auth and config. It stays unchanged except for one new `GET /api/config` endpoint.

The **app server** is application logic. It proxies daemon calls through facade endpoints, enriches responses with app-specific data, owns its own SQLite DB for preferences and saved views, and serves the GUI as static files.

The **GUI** is presentation. A React SPA that only talks to the app server. It never calls the daemon directly.

This means the daemon doesn't know or care about the GUI. Someone could build a Slack bot or a scheduled reporter against the same daemon API without touching the app server.

## Workspace structure

Everything lives in one workspace: `commandGarden/app/`.

```
app/
  src/
    server/
      main.ts              Entry point (Fastify)
      daemon-client.ts     HTTP client for daemon API
      routes/              Facade endpoints
      store.ts             SQLite (preferences, saved views)
    client/
      main.tsx             React entry
      App.tsx              Router + layout shell
      pages/               One file per route
      components/          Shared UI components
  package.json
  vite.config.ts
  tsconfig.json
  tsconfig.server.json
```

Server and client code share a package because they ship together. The server's only consumer is this client.

Added to the monorepo root:

```json
{ "workspaces": ["shared", "daemon", "cli", "chrome", "app"] }
```

Build order: `shared → daemon → cli → chrome → app`. The app workspace depends on nothing in the monorepo — it talks to the daemon over HTTP.

## App server

### Framework and dependencies

Fastify, matching the daemon. Server dependencies:
- `fastify` + `@fastify/static` (HTTP server, static file serving)
- `better-sqlite3` (app-specific persistence)

### Auth

The app server reads `~/.commandgarden/session-token` to authenticate with the daemon — same mechanism the CLI uses. The GUI-to-app-server connection has no auth; the server binds to `127.0.0.1` only. Network-level isolation is sufficient for a single-user localhost tool.

### Facade endpoints

The GUI only talks to the app server. Every daemon interaction goes through a facade endpoint that can enrich the response.

| Endpoint | Method | Source | What it does |
|---|---|---|---|
| `/api/status` | GET | Daemon | System health: daemon up, extension connected, connector count |
| `/api/connectors` | GET | Daemon + app DB | Connector list, enriched with last-run time and has-custom-page flag |
| `/api/connectors/:site/:name` | GET | Daemon | Full connector detail (schema, args, columns, pipeline) |
| `/api/run` | POST | Daemon | Execute a connector. Returns data or 202 + requestId for approval-gated runs |
| `/api/run/events/:id` | GET | Daemon SSE | Pipes the daemon's SSE stream for live approval events |
| `/api/approval` | POST | Daemon | Resolve a pending approval (approve or reject) |
| `/api/audit` | GET | Daemon | Audit events with time range, type, and connector filters |
| `/api/audit/:id` | GET | Daemon | Single event detail including pipeline steps |
| `/api/config` | GET | Daemon | Read full config |
| `/api/config` | POST | Daemon | Set a config value |
| `/api/preferences` | GET/PUT | App DB | User preferences (key-value) |
| `/api/views` | GET/POST/DELETE | App DB | Saved views per app |

### SSE piping

For approval-gated connector runs, the app server opens its own SSE connection to the daemon and pipes events to the GUI. This keeps the "GUI only talks to app server" rule intact and lets the app server enrich approval events or inject its own events later.

### Persistence

SQLite at `~/.commandgarden/app.db`. Two tables to start:

```sql
CREATE TABLE preferences (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE saved_views (
  id          TEXT PRIMARY KEY,
  app         TEXT NOT NULL,
  name        TEXT NOT NULL,
  config      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

This covers user preferences (like default format or sidebar state) and saved views (a timetracking filter combination or a frequently-checked room). Goals and other feature-specific tables get added when those features are built.

## GUI

### Tech stack

React 18+ with React Router for client-side routing. Vite as the build tool. Tailwind CSS + DaisyUI for styling. No other component libraries.

### Navigation

Fixed left sidebar with four groups, ordered by usage frequency:

1. **Overview**: Dashboard
2. **Apps**: Time Tracking, Room Availability
3. **Platform**: Connectors, Audit Log, Configuration
4. **Help**: Setup Guide

The sidebar footer shows live system status (daemon connected, extension linked) pulled from `/api/status` and polled every 30 seconds.

### Routes

```
/                          Dashboard (system health + recent activity)
/apps/timetracking         Custom timetracking page
/apps/rooms                Custom room availability page
/connectors                Connector list
/connectors/:site/:name    Generic connector runner
/audit                     Audit log viewer
/config                    Configuration editor
/guide                     Setup guide + tutorial
```

### Custom app page registry

A static map in the GUI code determines which connectors have dedicated app pages:

```typescript
const APP_ROUTES: Record<string, string> = {
  "timetracking/report": "/apps/timetracking",
  "teams/room-availability": "/apps/rooms",
};
```

On the connectors list page, connectors in this map show an "Open App" button. All connectors show a "Run" button for the generic runner.

## Page specifications

### Dashboard

Calls `/api/status` on mount (polls every 30s) and `/api/audit?limit=10` for recent activity.

Three health cards at the top: daemon status, extension connectivity, connector count. Below that, a recent activity table showing time (relative), connector key, event type, duration, and a status badge.

### Connectors list

Calls `/api/connectors` on mount. Each connector rendered as a row with: connector key (monospace), access badge, capability badges, description, domains. Two action buttons: "Open App" (if custom page exists) or "Run" (generic runner).

### Generic connector runner

Route: `/connectors/:site/:name`. Fetches the connector schema from `/api/connectors/:site/:name` and auto-generates a form from the `args` array. Each arg becomes a form field — text input with placeholder from `help`, "(optional)" label if not required, pattern validation where specified. An output format dropdown (table/json/csv) and a Run button.

On submit, calls `POST /api/run`. Shows a spinner with the message "Running [connector key] — this drives your browser and may take up to a minute." For approval-gated runs, connects to the SSE stream and shows inline Approve/Reject buttons when an approval event arrives.

Results render as a table with column headers from the connector schema, plus metadata (row count, duration).

### Audit log

Calls `/api/audit` with query params on mount and on filter change. Three filter dropdowns: time range (preset durations: 24h, 7d, 30d, 90d), event type (dropdown from known types), connector (dropdown populated from the connectors list). Paginated at 20 events per page.

Each row shows: timestamp, type badge, connector, user, duration, correlation ID. A "Details" button expands the event inline showing all fields plus a pipeline steps table (step number, type, capability, duration, error).

Polls every 60 seconds for new events.

### Configuration

Calls `GET /api/config` on mount. Renders config values grouped by section (daemon, security, connectors, audit, app). Simple values get text/number inputs. Array values (like `approvedHighRisk`) render as removable tag chips with an "Add" button.

Save button iterates changed values and calls `POST /api/config` for each. Shows a success or error toast.

### Setup guide

An interactive checklist with live status. Calls `/api/status` on mount and re-checks every 10 seconds. Each step shows:
- A check/circle icon for done/pending
- A status badge (e.g., "detected v22.0.0", "port 19825", "action needed")
- A short description
- Expandable instructions (collapsible `<details>`)

Steps checked: Node.js installed (inferred from daemon running), daemon running, Chrome extension connected, connectors loaded, high-risk connectors approved.

Below the checklist, a "Try it out" section with buttons linking to the generic runner for each available connector.

### App: Time Tracking

Month picker and Run button. Calls `POST /api/run` with `connector: "timetracking/report"` and `args: { month }`.

The app server transforms raw rows into: summary cards (total hours, working days used/available, project count, draft entry count) and a grouped-by-project table (project, total hours, entry count, status). Raw booking lines are in a collapsible section.

Handles the `auth_required` error state with a callout: "Sign in to the timetracking portal in Chrome, then try again."

### App: Room Availability

Room combobox (filterable dropdown with a static room list, migrated from the old dashboard) + date picker + Run button. Calls `POST /api/run` with `connector: "teams/room-availability"` and `args: { room, date }`.

Renders a visual timeline bar with proportional-width colored blocks (green for free, red for busy, yellow for tentative). Below that, a detail table with start, end, state badge, and duration.

Handles the `auth_required` error state with the same callout pattern.

## CLI commands

New commands added to `cg`:

| Command | What it does |
|---|---|
| `cg gui` | Start app server foreground, open browser |
| `cg gui --background` | Start app server detached, write PID to `~/.commandgarden/app.pid` |
| `cg gui --no-open` | Start without opening browser |
| `cg gui stop` | Stop the app server |
| `cg gui status` | Check if app server is running |
| `cg up` | Start daemon + app server (both background), open browser |
| `cg down` | Stop app server + daemon |

### `cg gui` lifecycle

1. Hit `http://127.0.0.1:19825/api/status` to check if the daemon is running
2. If not: error out with "Daemon is not running. Start it with: cg daemon start (or use cg up)"
3. Read `app.port` from config (default 19826)
4. Start the Fastify app server, serve `app/dist/client/` as static files
5. Open browser to `http://127.0.0.1:<port>` (unless `--no-open`)
6. Foreground mode: log requests to stdout, Ctrl+C stops it
7. Background mode: write PID to `~/.commandgarden/app.pid`, detach

### `cg up` lifecycle

1. Start daemon if not running (same as `cg daemon start`)
2. Poll `/api/status` for up to 5 seconds until ready
3. Start app server in background
4. Open browser
5. Print: `Daemon running on :19825, GUI running on :19826`

### `cg down` lifecycle

1. Stop app server (read `app.pid`, send SIGTERM)
2. Stop daemon (same as `cg daemon stop`)
3. Print: `All services stopped`

## Daemon changes

One new endpoint:

```typescript
// Added to server.ts alongside existing endpoints
app.get('/api/config', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { parse: parseYaml } = await import('yaml');
  let config = {};
  if (existsSync(deps.configPath)) {
    config = parseYaml(readFileSync(deps.configPath, 'utf-8')) ?? {};
  }
  return { ok: true, config };
});
```

Authenticated via the existing auth hook. Returns the full config object.

The CLI's `cg config show` can optionally migrate to this endpoint for consistency, but it's not required for v1.

## Configuration

New config section in `~/.commandgarden/config.yaml`:

```yaml
app:
  port: 19826
```

## Build pipeline

Two-stage build in the `app/` workspace:

1. `vite build` compiles the React SPA to `app/dist/client/`
2. `tsc -p tsconfig.server.json` compiles the server to `app/dist/server/`

Scripts:

```json
{
  "build": "vite build && tsc -p tsconfig.server.json",
  "dev": "concurrently \"vite\" \"tsx watch src/server/main.ts\"",
  "start": "node dist/server/main.js",
  "test": "vitest run"
}
```

In dev mode, Vite serves the SPA on `:5173` with HMR. The app server runs on `:19826` and proxies static assets to Vite. Both start with `npm run dev`.

In production, the app server serves the built SPA from `dist/client/` via `@fastify/static`.

## Testing

Vitest for server-side logic in v1. No GUI component tests yet.

Tests:
- `daemon-client.test.ts` — mock fetch, verify request formatting and error handling
- `store.test.ts` — in-memory SQLite, verify preferences and saved views CRUD
- `routes/*.test.ts` — test facade endpoints with mocked daemon responses

GUI component tests get added when client-side logic grows beyond simple form-to-API calls.

## Migration from old dashboard

The old `dashboard/` directory (NestJS + Next.js + opencli) is replaced by this GUI.

**Migrated:**
- Timetracking page (month picker, report table, summary) — rewritten to use commandGarden connectors
- Room availability page (room combobox, date picker, timeline view) — rewritten
- TimelineView component (DaisyUI badges for free/busy/tentative states)
- RoomCombobox component (filterable dropdown with keyboard nav)
- AuthRequiredCallout component
- Spinner component

**Deferred:**
- Goals module (needs app DB schema, CRUD API, progress calculations)

**Dropped:**
- NestJS API layer (replaced by the app server)
- opencli service (commandGarden replaces opencli)

## Deferred features

Not in v1:
- Goals tracking and progress
- Step-by-step progress events for all runs (needs daemon protocol changes)
- Scheduled/recurring connector runs
- Export/download results from the GUI
- Desktop/browser notifications for approval requests
- Dark/light theme toggle

## Dependencies (app/package.json)

Server: `fastify`, `@fastify/static`, `better-sqlite3`

Client: `react`, `react-dom`, `react-router-dom`, `tailwindcss`, `daisyui`

Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `concurrently`, `tsx`, `@types/better-sqlite3`, `@types/react`, `@types/react-dom`

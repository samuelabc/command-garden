# commandGarden

Enterprise browser automation that turns websites into secure, auditable CLI commands using declarative YAML connectors.

commandGarden reuses your existing Chrome sessions — no credentials are stored or transmitted. Every command is validated against declared domains and capabilities, and every execution is logged to a local audit trail.

For the full design spec, see [`docs/superpowers/specs/2026-06-23-commandgarden-design.md`](../docs/superpowers/specs/2026-06-23-commandgarden-design.md).

---

## Architecture

```
┌─────────────┐      HTTP       ┌──────────────┐    WebSocket    ┌───────────────────┐
│  CLI Client  │ ──────────────→ │    Daemon    │ ←────────────→ │  Chrome Extension  │
│  (Node.js)   │  localhost:19825│  (Fastify)   │                │  (MV3, TypeScript) │
└─────────────┘                  └──────────────┘                └───────────────────┘
       │                               │                                │
       │  1. Send command               │  2. Validate token,           │  3. Execute pipeline
       │     as HTTP POST               │     capabilities, domains     │     steps on page
       │                               │     Log audit event           │
       │                               │  4. Relay via WebSocket        │  4. Return structured
       │                               │                               │     data
       │                               ▼                               │
       │                         ┌──────────────┐                      │
       │  6. Receive response    │  Audit Log   │                      │
       │     (table/json/csv)    │  (SQLite)    │  5. Relay response   │
       │                         └──────────────┘     back to CLI      │
```

**Data flow:** CLI sends a command → Daemon validates auth, domains, and capabilities → Daemon relays to the Chrome Extension via WebSocket → Extension runs the connector's pipeline steps on the target page → Structured data flows back through the Daemon to the CLI.

---

## Prerequisites

- **Node.js** >= 20
- **npm** >= 9 (with workspaces support)
- **Chrome** or **Chromium** (for sideloading the extension)

---

## Build & Install

```bash
# From the commandGarden/ directory
npm install
npm run build
```

Build compiles all four workspace packages in dependency order: `shared` → `daemon` → `cli` → `chrome`.

---

## Setup

### 1. Start the Daemon

```bash
# Option A: via the CLI (builds must be complete)
node cli/dist/main.js daemon start

# Option B: directly
node daemon/dist/main.js
```

The daemon binds to `127.0.0.1:19825` by default and writes a session token to `~/.commandgarden/session-token`.

### 2. Load the Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `commandGarden/chrome/dist/` directory

The extension's service worker will connect to the daemon via WebSocket on `ws://127.0.0.1:19825`.

### 3. Verify

```bash
node cli/dist/main.js daemon status
```

Expected output:

```
Daemon is running on http://127.0.0.1:19825
```

---

## Happy Flow: Running a Connector

This walkthrough uses the built-in `demo/extract-table` connector, which extracts rows from an HTML table.

### List available connectors

```bash
node cli/dist/main.js list
```

```
CONNECTOR                  ACCESS  DOMAINS                      CAPABILITIES
demo/extract-table         read    demo.example.com             navigate, dom_read
timetracking/report        read    timetracking.mercedes…       navigate, js_evaluate
teams/room-availability    read    outlook.cloud.microsoft.…    navigate, js_evaluate
```

### Inspect a connector

```bash
node cli/dist/main.js inspect demo/extract-table
```

```
Connector: demo/extract-table v1.0
Description: Extract rows from an HTML table — sample connector for testing
Access: read
Domains: demo.example.com
Capabilities: navigate, dom_read

Arguments:
  --minScore  (number, optional, default: 0)  Minimum score to include in results

Output columns: name, email, score, status

Pipeline steps:
  1. navigate → https://demo.example.com/users
  2. wait → #data-table tbody (5000ms)
  3. extract → #data-table tbody tr
  4. map → name, email, score, status
  5. filter → score gte minScore
```

### Run with JSON output

```bash
node cli/dist/main.js run demo/extract-table --minScore 50 --format json
```

```json
{
  "ok": true,
  "connector": "demo/extract-table",
  "rowCount": 3,
  "columns": ["name", "email", "score", "status"],
  "data": [
    { "name": "Alice", "email": "alice@example.com", "score": 92, "status": "ACTIVE" },
    { "name": "Bob", "email": "bob@example.com", "score": 78, "status": "ACTIVE" },
    { "name": "Carol", "email": "carol@example.com", "score": 65, "status": "PENDING" }
  ]
}
```

### Run with table output

```bash
node cli/dist/main.js run demo/extract-table --minScore 50 --format table
```

```
┌────────┬─────────────────────┬───────┬──────────┐
│ name   │ email               │ score │ status   │
├────────┼─────────────────────┼───────┼──────────┤
│ Alice  │ alice@example.com   │    92 │ ACTIVE   │
│ Bob    │ bob@example.com     │    78 │ ACTIVE   │
│ Carol  │ carol@example.com   │    65 │ PENDING  │
└────────┴─────────────────────┴───────┴──────────┘
```

### Timetracking report

```bash
node cli/dist/main.js run timetracking/report --month 2026-06 --format json
```

This connector navigates to the timetracking portal, fetches the monthly report API using your existing browser session cookies, and returns structured booking data.

> **Note:** This connector uses `js_evaluate` (a high-risk capability) and must be approved before first use — see [Approving high-risk connectors](#approving-high-risk-connectors).

### Room availability (Teams/Outlook)

```bash
# By room name
node cli/dist/main.js run teams/room-availability --room "MBTMY The Vista" --format json

# By room email
node cli/dist/main.js run teams/room-availability --room "RES-RERE-M6VJ7ZUW@mercedes-benz.com" --date 2026-06-18 --format table
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
node cli/dist/main.js validate connectors/my-connector.yaml
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

Every command execution is logged to `~/.commandgarden/audit.db` (SQLite). The audit log records what was accessed and row counts, never actual data values.

```bash
# List recent events
node cli/dist/main.js audit list --since 7d

# Filter by connector
node cli/dist/main.js audit list --since 30d --connector timetracking/*

# Export as JSON
node cli/dist/main.js audit export --format json --since 30d
```

Denied commands (unapproved domain, missing capability, invalid token) are logged with a denial reason.

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
node cli/dist/main.js config show
node cli/dist/main.js config set daemon.port 9999
node cli/dist/main.js config set audit.retentionDays 180
```

### Approving high-risk connectors

Connectors that use `js_evaluate` or `cookie_write` are classified as **high-risk** and blocked by default. To allow a connector to run, add its key (`site/name`) to `security.approvedHighRisk` in `~/.commandgarden/config.yaml`:

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
```

---

## Project Structure

```
commandGarden/
  shared/        Shared types — connector schema (Zod), protocol messages,
                 audit events, expression parser, pipeline definitions
  daemon/        Local HTTP + WebSocket server (Fastify) — auth token
                 management, connector registry, capability validation,
                 audit store (SQLite), WebSocket relay to extension
  cli/           CLI client (Commander.js) — run, list, inspect, validate,
                 daemon management, audit queries, config management
  chrome/        Chrome MV3 extension — service worker, content scripts,
                 domain guard, pipeline step execution engine
  connectors/    Built-in YAML connector definitions
  package.json   Workspace root (npm workspaces)
```

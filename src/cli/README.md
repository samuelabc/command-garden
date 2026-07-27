# commandGarden

[![npm version](https://img.shields.io/npm/v/@commandgarden/cli.svg)](https://www.npmjs.com/package/@commandgarden/cli)

Enterprise browser automation that turns websites into secure, auditable CLI commands using declarative YAML connectors.

commandGarden reuses your existing Chrome sessions — no credentials are stored or transmitted. Every command is validated against declared domains and capabilities, and every execution is logged to a local audit trail.

---

## Architecture

```
┌──────────────┐       HTTP        ┌──────────────┐     WebSocket     ┌────────────────────┐
│  CLI Client  │ ────────────────→ │    Daemon    │ ←───────────────→ │  Chrome Extension  │
│  (Node.js)   │  localhost:9091   │  (Fastify)   │                   │  (MV3, TypeScript) │
└──────────────┘                   └──────────────┘                   └────────────────────┘
                                     ↑         │                         │            │
                                     │         │               Content   │    CDP     │
┌──────────────┐   ┌──────────────┐  │         │               Scripts   │  (debugger)│
│  GUI (React) │──→│  App Server  │──┘         │                         ↓            ↓
│  SPA         │   │  (Fastify)   │            │               ┌────────────────────────┐
└──────────────┘   │  :9092       │            │               │      Browser Tab       │
                   └──────────────┘            │               │  (target web page)     │
                          │                    │               └────────────────────────┘
                   ┌──────────────┐    ┌──────────────┐
                   │   App DB     │    │  Audit Log   │
                   │   (SQLite)   │    │  (SQLite)    │
                   └──────────────┘    └──────────────┘
```

**Data flow:** CLI or GUI sends a command → Daemon validates auth, domains, and capabilities → Daemon relays to the Chrome Extension via WebSocket → Extension runs the connector pipeline on the target page → Structured data flows back through the Daemon to the CLI or GUI.

---

## Install

```bash
npm install -g @commandgarden/cli
```

Requires Node.js >= 20. Provides both `commandgarden` and the shorthand `cg` on PATH.

---

## Quick Start

### 1. Start the daemon and GUI

```bash
cg up
```

This starts the daemon (`:9091`), the GUI app server (`:9092`), and opens the browser. To stop: `cg down`.

### 2. Load the Chrome Extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `node_modules/@commandgarden/chrome/dist/` directory

The extension connects to the daemon via WebSocket on `ws://127.0.0.1:9091`.

### 3. Verify

```bash
cg daemon status
```

---

## Usage

### List connectors

```bash
cg list
```

### Run a connector

```bash
# Table output (default)
cg run simonwillison/blog --format table

# JSON output
cg run simonwillison/blog --tag ai --format json

# CSV output
cg run trailofbits/blog --format csv
```

### Inspect a connector

```bash
cg inspect simonwillison/blog
```

### Validate a connector file

```bash
cg validate path/to/connector.yaml
```

---

## Writing Connectors

Connectors are declarative YAML files that define a pipeline of browser automation steps. Place custom connectors in `~/.commandgarden/connectors/`.

```yaml
site: mysite
name: my-command
version: "1.0"
description: "Extract search results from mysite"
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

### Pipeline steps

| Step | Purpose | Capability |
|---|---|---|
| `navigate` | Open a URL | `navigate` |
| `wait` | Wait for a selector or timeout | `navigate` |
| `extract` | Read data from DOM elements | `dom_read` |
| `extract_tree` | Recursive DOM tree walk with ancestry | `dom_read` |
| `extract_html` | Capture element HTML as a variable | `dom_read` |
| `click` | Click an element | `dom_write` |
| `click_all` | Click all matching elements | `dom_write` |
| `type` | Type text into an input | `dom_write` |
| `cookie` | Read cookies for a domain | `cookie_read` |
| `fetch` | Authenticated HTTP request from page context | `network_fetch` |
| `js_evaluate` | Run JavaScript in page context | `js_evaluate` |
| `map` | Transform/rename fields | none |
| `filter` | Filter rows by condition | none |
| `set` | Set a variable for later steps | none |

### Expression syntax

Use `${{ }}` for template expressions:

- `args.month`, `vars.token`, `cookies.name` — variable access
- `row.id`, `row.name` — row access inside `map` steps
- `"Bearer " + vars.token` — string concatenation
- `args.month | default("2026-06")` — pipe filters

---

## Security Model

### Capabilities

Every connector declares which browser capabilities it requires. The daemon validates these before execution:

- **Low-risk:** `navigate`, `dom_read`, `dom_write`, `cookie_read`, `network_fetch`, `daemon_transform`
- **High-risk:** `js_evaluate`, `cdp_attach`, `state_mutate`, `network_egress`

### Domain guard

Each connector declares its allowed domains. The extension's domain guard blocks navigation and network requests to any domain not in the connector's allowlist.

### High-risk approval

Connectors using high-risk capabilities are blocked by default, and a connector runs only once **every** high-risk capability it declares is approved. Approve them explicitly:

```bash
cg config approve mysite/my-command js_evaluate network_egress
```

Each `approve` sets the connector's approved list to exactly the capabilities you pass, so list them all in one command rather than approving them one at a time. Use `cg config revoke` to remove individual entries.

### Step approval

Individual pipeline steps can require user confirmation before executing. Configure which capabilities need approval:

```yaml
# In ~/.commandgarden/config.yaml
security:
  approvalRequired:
    - js_evaluate
    - dom_write
```

When a step requires approval, the user is prompted in both the CLI terminal and the Chrome extension popup.

### Audit log

Every execution is logged to `~/.commandgarden/audit.db` (SQLite). The log records what was accessed and row counts, never actual data values. Sensitive arguments are automatically redacted.

```bash
cg audit list --since 7d
cg audit list --connector mysite/* --since 30d
cg audit show <event-id>
cg audit export --format json --since 30d
```

---

## Configuration

Stored at `~/.commandgarden/config.yaml`, created automatically on first start.

```yaml
daemon:
  port: 9091
  host: "127.0.0.1"

security:
  highRiskCapabilities:
    - js_evaluate
    - cdp_attach
    - state_mutate
    - network_egress
  approvedHighRisk: {}

connectors:
  paths:
    - "~/.commandgarden/connectors"

audit:
  retentionDays: 90

output:
  defaultFormat: table
```

```bash
cg config show
cg config set daemon.port 9999
cg config set audit.retentionDays 180
```

---

## Web GUI

`cg up` opens a browser-based interface at `http://127.0.0.1:9092` with:

- **Dashboard** — system health and recent activity
- **Connectors** — browse, approve, and run connectors via auto-generated forms
- **Audit Log** — filterable, paginated event viewer with pipeline step detail
- **Configuration** — task-oriented settings with per-connector approval toggles and raw YAML editor
- **Architecture** — system diagrams and data-flow swimlanes
- **API & CLI Reference** — CLI commands, daemon API, and pipeline step reference

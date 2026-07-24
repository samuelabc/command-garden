# commandGarden

Enterprise browser automation that turns websites into secure, auditable CLI commands using declarative YAML connectors.

commandGarden reuses your existing Chrome sessions — no credentials are stored or transmitted. Every command is validated against declared domains and capabilities, and every execution is logged to a local audit trail.

For the full design spec, see [`docs/superpowers/specs/2026-06-23-commandgarden-design.md`](docs/superpowers/specs/2026-06-23-commandgarden-design.md).

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

**Data flow:** CLI or GUI sends a command → Daemon validates auth, domains, and capabilities → Daemon relays to the Chrome Extension via WebSocket → Extension runs the connector's pipeline steps on the target page → Structured data flows back through the Daemon to the CLI or GUI.

The **App Server** (`:9092`) is the GUI's backend — it proxies daemon calls, enriches responses, and owns app-specific state (preferences, saved views). The GUI never talks to the daemon directly.

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
npm install
npm run build

# Link globally so 'cg' and 'commandgarden' are available on PATH
npm link --workspace=src/cli
```

Build compiles all five workspace packages in dependency order: `shared` → `daemon` → `cli` → `chrome` → `app`.

---

## Setup

### 1. Quick start (daemon + GUI)

```bash
cg up
```

This starts the daemon, starts the GUI app server, and opens the browser to `http://127.0.0.1:9092`. To stop everything: `cg down`.

### 1b. Start components individually

```bash
# Daemon only
cg daemon start

# GUI only (requires daemon)
cg gui --background

# Or directly (from source builds)
node src/daemon/dist/main.js
node src/app/dist/server/main.js
```

The daemon binds to `127.0.0.1:9091` by default and writes a session token to `~/.commandgarden/session-token`. The GUI app server binds to `127.0.0.1:9092` (configurable via `app.port` in config.yaml).

### 2. Load the Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `src/chrome/dist/` directory

The extension's service worker will connect to the daemon via WebSocket on `ws://127.0.0.1:9091`.

### 3. Verify

```bash
cg daemon status
```

Expected output:

```
Daemon is running on http://127.0.0.1:9091
```

---

## Web GUI

The GUI provides a browser-based interface at `http://127.0.0.1:9092` with:

- **Dashboard** — system health cards (daemon, extension, connectors) and recent activity
- **Connectors** — browse all connectors with approval status badges, inline approve action for high-risk connectors, run any connector via an auto-generated form
- **App pages** — dedicated UI for Time Tracking (month picker, summary cards, grouped-by-project table), Room Availability (room combobox, timeline bar), Security News (aggregated feed from Socket, Wiz, and tl;dr sec with caching, source indicators, and date range filtering), AI News (aggregated feed from Simon Willison's blog and Every newsletter with caching and date range filtering), and Roles (user identity from UIS + role assignments from Alice with search, expandable details, and caching)
- **Audit Log** — filterable, paginated event viewer with expandable pipeline step detail
- **Configuration** — task-oriented settings page with Server, Connector Security (per-connector approval table with toggles), Connector Sources, Audit & Retention, and Output sections; includes a raw YAML editor and sticky save bar with dirty tracking
- **Setup Guide** — interactive checklist with live status polling
- **Architecture** — SVG system diagram, component cards, data store table, swimlane data-flow diagrams (command execution with separate CLI/GUI paths, step approval, extension connection), security model, workspace packages, and build order
- **API & CLI Reference** — tabbed reference (CLI commands, Daemon API endpoints, App Server API endpoints) with expandable detail rows, pipeline step table, and expression syntax reference
- **Skills** — installed skill browser

Start with `cg up` or `cg gui`. For the full design spec, see [`docs/superpowers/specs/2026-07-01-commandgarden-gui-design.md`](docs/superpowers/specs/2026-07-01-commandgarden-gui-design.md).

---

## Happy Flow: Running a Connector

### List available connectors

```bash
cg list
```

```
CONNECTOR                      ACCESS  DOMAINS                      CAPABILITIES
timetracking/report            read    timetracking.mercedes…       navigate, js_evaluate
teams/room-availability        read    outlook.cloud.microsoft.…    navigate, js_evaluate
tokenmaster/clients-list       read    tma.query.api.dvb.corp…      navigate, cookie_read
tokenmaster/client-trustedby   read    tma.query.api.dvb.corp…      navigate, cookie_read
uis/mic-user-information       read    uis.query.api.dvb.corp…      navigate, js_evaluate
alice/role-list                read    alice.mercedes-benz.com      navigate, cookie_read
every/newsletter               read    every.to                     navigate, js_evaluate
gcs/kb-pages                   read    pages.i.mercedes-benz.com    navigate, dom_read, dom_write
gcs/kb-content                 read    pages.i.mercedes-benz.com    navigate, dom_read
socket/security-news           read    socket.dev                   navigate, cookie_read
wiz/blog-security              read    www.wiz.io                   navigate, js_evaluate
tldrsec/newsletter             read    tldrsec.com                  navigate, js_evaluate
simonwillison/blog             read    simonwillison.net            navigate, js_evaluate
mtslive/archive                read    mtslive.substack.com         navigate, cookie_read
```

### Timetracking report

```bash
cg run timetracking/report --month 2026-06 --format json
```

This connector navigates to the timetracking portal, fetches the monthly report API using your existing browser session cookies, and returns structured booking data.

> **Note:** This connector uses `js_evaluate` (a high-risk capability) and must be approved before first use — see [Approving high-risk connectors](#approving-high-risk-connectors).

### TokenMaster clients

```bash
# List clients from all regions (default)
cg run tokenmaster/clients-list --format table

# List clients from a specific region
cg run tokenmaster/clients-list --region emea --format table
cg run tokenmaster/clients-list --region amap --format table
cg run tokenmaster/clients-list --region cn --format table

# Explicitly list from all regions (same as default)
cg run tokenmaster/clients-list --region all --format table
```

The `--region` argument accepts `emea`, `amap`, `cn`, or `all` (default). When set to `all`, the daemon **fans out** — it runs the pipeline once per region sequentially, merges the results, and prepends a `region` column to the output so you can tell which region each client belongs to.

This connector calls the TokenMaster API (`/v1/clients`) using your browser session cookies — no JS evaluation, no DOM scraping. It's the first **declarative-only** connector: the pipeline uses `navigate → wait → fetch → map` with `cookie_read` capability.

### TokenMaster client trustedby

```bash
# List clients that trust a given client
cg run tokenmaster/client-trustedby --clientid 3562D247-46AA-44E3-A0ED-ADF5A4C954F1 --format table

# Query a different region
cg run tokenmaster/client-trustedby --clientid 3562D247-46AA-44E3-A0ED-ADF5A4C954F1 --region amap --format table
```

This connector calls the TokenMaster API (`/v2/clients/{clientid}/trustedby`) to retrieve the list of clients that trust a given client. Returns `id`, `name`, `is_onboard_client`, `idDisplay`, and `expiry_date`. Same declarative `navigate → wait → fetch → map` pipeline as `clients-list`.

### UIS user information

```bash
cg run uis/mic-user-information --userId SATHIEN --format json
```

This connector fetches full user information from the UIS API (`/v1/users/prod/{userId}`) using your browser session cookies. Returns a single row with `uid`, `givenName`, `familyName`, `mail`, `department`, `supervisor`, `usertype`, `employeeType`, `managementlevel`, `active`, `isClient`, plus comma-separated `groups` (AD group memberships) and `scopes` (UIS scope IDs).

> **Note:** This connector uses `js_evaluate` (a high-risk capability) and must be approved before first use — see [Approving high-risk connectors](#approving-high-risk-connectors).

### Alice role list

```bash
cg run alice/role-list --userId SATHIEN --format json
```

This connector fetches role assignments for a user from the Alice access management portal (`/alice-proxy-v2/gems/users/{userId}/roles`). Returns `roleId`, `roleName`, `description`, `roleType`, `validFrom`, `validTo`, `isSelfRequestable`, `privileged`, and `dataClassification`. Uses the declarative `navigate → wait → fetch → map` pipeline with `cookie_read` capability — no `js_evaluate`.

### Room availability (Teams/Outlook)

```bash
# By room name
cg run teams/room-availability --room "MBTMY The Vista" --format json

# By room email
cg run teams/room-availability --room "RES-RERE-M6VJ7ZUW@mercedes-benz.com" --date 2026-06-18 --format table
```

This connector drives the Outlook Scheduling Assistant in your authenticated browser session to fetch a meeting room's free/busy timeline for a given day. It intercepts the page's own GraphQL `getSchedule` call (the endpoint rejects replayed requests) and returns time blocks with state (`free`, `busy`, `tentative`, `oof`, `elsewhere`), start/end times, and duration.

> **Note:** This connector uses `js_evaluate` (a high-risk capability) and must be approved before first use — see [Approving high-risk connectors](#approving-high-risk-connectors).

### Room availability — multiple rooms (Teams/Outlook)

```bash
# Batch mode (name:email pairs) — ~2x faster, adds all rooms then captures once
cg run teams/rooms-availability --rooms "MBTMY The Vista:RES-RERE-M6VJ7ZUW@mercedes-benz.com,MBTMY The Cliffside:res-rere-m6vjl2tw@mercedes-benz.com" --format table

# Sequential mode (names only) — adds/captures/dismisses one room at a time
cg run teams/rooms-availability --rooms "MBTMY The Vista,MBTMY The Cliffside" --format table

# Sequential mode (mix names and emails)
cg run teams/rooms-availability --rooms "MBTMY The Vista,res-rere-m6vjl2tw@mercedes-benz.com" --date 2026-07-10 --format json
```

Same approach as `teams/room-availability`, but handles multiple rooms and returns a combined timeline with `roomName` (original input) and `roomEmail` (resolved schedule ID) columns. Two modes:

- **Batch mode** — when every room is a `name:email` pair, all rooms are added via the room finder without dismiss/capture between each, then a single batch capture maps scheduleIds using the pre-known emails. ~2s per room + one capture.
- **Sequential mode** — when any room lacks an email, rooms are processed one at a time (add → capture → dismiss). ~4-8s per room.

Rooms that fail to resolve produce an error row while successful rooms return their full timeline. See [design notes](docs/teams-rooms-availability-notes.md) for details.

### GCS Knowledge Base pages

```bash
cg run gcs/kb-pages --format table
```

This connector navigates to the GCS Knowledge Base (a Next.js docs site behind Mercedes-Benz SSO), expands every sidebar section, and extracts a page index with title, URL, section, breadcrumb path, and hierarchy depth. Returns all leaf pages (~57 articles covering General Security, AI Security, DevSecOps, Cloud Security, Tools & Platforms, and more). Uses declarative `click_all` + `extract_tree` steps — no `js_evaluate`.

### GCS Knowledge Base content

```bash
# short path (recommended)
cg run gcs/kb-content --path general-security/edr/ --format json

# full path from kb-pages index also works
cg run gcs/kb-content --path gcs/KB/docs/general-security/edr/ --format json
```

This connector retrieves a single GCS Knowledge Base page and converts it to Markdown. Accepts both a short path (e.g. `general-security/edr/`) or the full `url` value from the `gcs/kb-pages` index (e.g. `gcs/KB/docs/general-security/edr/`). Returns one row with `title`, `path`, `author`, `lastUpdated`, and the full page `content` as Markdown (headings, code blocks, tables, and lists preserved). Uses declarative `extract` + `extract_html` + server-side `transform` steps — no `js_evaluate`.

### Security news connectors

Three connectors power the **Security News** app page, fetching the latest posts from different sources:

```bash
# Socket.dev blog feed (declarative fetch, no js_evaluate)
cg run socket/security-news --format table

# Wiz security blog (extracts from Next.js __NEXT_DATA__)
cg run wiz/blog-security --format table

# tl;dr sec newsletter (extracts from Remix __remixContext)
cg run tldrsec/newsletter --format table
```

The **tl;dr sec** connector navigates to `https://tldrsec.com/t/Newsletter` (a Beehiiv-hosted Remix app), reads the embedded `__remixContext` loader data, and extracts newsletter issues with title, slug, URL, publish date, excerpt, authors, and tags. Returns the first page of results (~12 issues).

> **Note:** `wiz/blog-security` and `tldrsec/newsletter` use `js_evaluate` (a high-risk capability) and must be approved before first use — see [Approving high-risk connectors](#approving-high-risk-connectors).

### Simon Willison's blog

```bash
# All recent posts
cg run simonwillison/blog --format table

# Filter by tag
cg run simonwillison/blog --tag ai --format table
cg run simonwillison/blog --tag python --format json
```

This connector fetches the Atom feed from `https://simonwillison.net/atom/everything/`, parses the XML entries, and returns blog posts with title, URL, publish date, a plain-text summary (truncated to 300 chars), and comma-separated tags. The optional `--tag` argument filters posts by tag (e.g. `ai`, `python`, `llms`).

> **Note:** This connector uses `js_evaluate` (a high-risk capability) and must be approved before first use — see [Approving high-risk connectors](#approving-high-risk-connectors).

### Every newsletter

```bash
# Latest posts (default: newest first)
cg run every/newsletter --format table

# Sort by popularity
cg run every/newsletter --sort popular --format table

# Sort oldest first
cg run every/newsletter --sort oldest --format json
```

This connector scrapes blog posts from `https://every.to/newsletter`, extracting title, URL, publish date, author, and a plain-text summary (truncated to 300 chars). It tries Next.js `__NEXT_DATA__` extraction first, falling back to DOM scraping. The optional `--sort` argument controls sort order (`popular`, `newest`, `oldest`).

> **Note:** This connector uses `js_evaluate` (a high-risk capability) and must be approved before first use — see [Approving high-risk connectors](#approving-high-risk-connectors).

### MTS Substack archive

```bash
# Latest posts (default: 12)
cg run mtslive/archive --format table

# Retrieve more posts
cg run mtslive/archive --limit 25 --format table

# Paginate (skip first 12)
cg run mtslive/archive --limit 12 --offset 12 --format json
```

This connector fetches blog posts from the MTS Substack archive (`https://mtslive.substack.com/api/v1/archive`) using the declarative `navigate → wait → fetch → map` pipeline with `cookie_read` capability — no `js_evaluate`. Returns title, subtitle, URL, publish date, word count, and reaction count.

---

## Writing a Custom Connector

Create a YAML file in `~/.commandgarden/connectors/` (user-defined; overrides a built-in connector with the same `site/name`). Built-in connectors ship inside the package itself and are rebuilt from `connectors/` at the monorepo root — see `src/daemon/scripts/copy-connectors.mjs` if you're adding one there.

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
| `extract_tree` | Recursive DOM tree walk with ancestry | `dom_read` |
| `extract_html` | Capture element HTML as a variable | `dom_read` |
| `click` | Click an element | `dom_write` |
| `click_all` | Click all matching elements (with re-scan loop) | `dom_write` |
| `type` | Type text into an input | `dom_write` |
| `intercept` | Capture a network response body | `intercept_response` |
| `cookie` | Read cookies for a domain | `cookie_read` |
| `fetch` | HTTP request from page context | `cookie_read` |
| `map` | Transform/rename extracted fields (use `${{ row.field }}`) | none |
| `filter` | Filter rows by condition | none |
| `set` | Set a variable for later steps | none |
| `transform` | Server-side data transform (e.g., HTML→Markdown) | none |

### Expression syntax

Use `${{ }}` for template expressions (no JS eval):

- **Variable access:** `args.month`, `vars.token`, `cookies.name`
- **Row access (map steps):** `row.id`, `row.name` — available only inside `map` step fields
- **String concatenation:** `"Bearer " + vars.token`
- **Pipe filters:** `args.month | default("2026-06")`, `value | number`, `text | trim`

> For full parameter details and examples for every step type, see the [Pipeline Step Reference](docs/pipeline-reference.md). For authoring patterns, fetch best practices, and debugging techniques, see the [Connector Authoring Guide](docs/connector-authoring.md).

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
  port: 9091
  host: "127.0.0.1"

security:
  extensionId: ""
  highRiskCapabilities:
    - js_evaluate
    - cookie_write
  approvedHighRisk: []

connectors:
  paths:
    - "<bundled-in-package>/connectors"   # built-in, ships with the CLI
    - "~/.commandgarden/connectors"        # your own connectors override built-ins with the same key

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
npm test -w src/shared
npm test -w src/daemon
npm test -w src/cli
npm test -w src/chrome
npm test -w src/app
```

---

## Publishing

Only `@commandgarden/cli` is published to npm. The daemon, app, and shared packages are bundled into the tarball via `bundleDependencies` and ship as part of the CLI install.

```bash
npm run build
cd src/cli && npm pack --dry-run      # verify contents
cd src/cli && npm publish --access public
```

For the full publishing guide, versioning policy, and troubleshooting, see **[docs/PUBLISHING.md](docs/PUBLISHING.md)**.

---

## Development

### Building

```bash
npm install
npm run build          # all workspaces: shared → daemon → cli → chrome → app

# Or build individual packages
npm run build -w src/shared
npm run build -w src/daemon
npm run build -w src/cli
npm run build -w src/chrome
npm run build -w src/app
```

### Starting the daemon (without `cg`)

During development, the `cg` CLI may not be globally linked. Start the daemon directly:

```bash
# After building
node src/daemon/dist/main.js
```

Or using the workspace script:

```bash
npm start -w src/daemon
```

The daemon will:
- Bind to `127.0.0.1:9091`
- Write a session token to `~/.commandgarden/session-token`
- Load connectors from its own bundled `connectors/` directory (ships with the package — works immediately after install) and then `~/.commandgarden/connectors` (your own connectors; same `site/name` key overrides the bundled version). Add further repo-relative or absolute paths to `connectors.paths` in `config.yaml` for monorepo-local development.

To verify it's running, hit the status endpoint:

```bash
curl http://127.0.0.1:9091/api/status
```

### Running the CLI from source (without global link)

```bash
node src/cli/dist/main.js daemon status
node src/cli/dist/main.js list
node src/cli/dist/main.js run teams/room-availability --room "MBTMY The Vista" --format json
node src/cli/dist/main.js run teams/rooms-availability --rooms "MBTMY The Vista:RES-RERE-M6VJ7ZUW@mercedes-benz.com,MBTMY The Cliffside:res-rere-m6vjl2tw@mercedes-benz.com" --format json
node src/cli/dist/main.js run teams/rooms-availability --rooms "MBTMY The Vista,MBTMY The Cliffside" --format json
node src/cli/dist/main.js run teams/rooms-availability --rooms "MBTMY THE BASE CAMP:res-rere-m6vz23ty@mercedes-benz.com,MBTMY THE TRAILHEAD:res-rere-m6vc2q4d@mercedes-benz.com,MBTMY THE FOOTHILLS:res-rere-m6vcb79c@mercedes-benz.com,MBTMY THE BRIDGE:res-rere-m6vgcah6@mercedes-benz.com,MBTMY THE RIDGE:res-rere-m6vjxdkc@mercedes-benz.com,MBTMY THE MEADOW:res-rere-m6vhkzmd@mercedes-benz.com,MBTMY THE FOREST:res-rere-m6vhsc6h@mercedes-benz.com,MBTMY THE LOOKOUT:res-rere-m6vjqgrq@mercedes-benz.com,MBTMY THE CLIFFSIDE:res-rere-m6vjl2tw@mercedes-benz.com,MBTMY THE LEDGE:res-rere-m6vjfbmr@mercedes-benz.com,MBTMY THE HIGHPOINT:res-rere-m6vjblgb@mercedes-benz.com,MBTMY THE VISTA:RES-RERE-M6VJ7ZUW@mercedes-benz.com,MBTMY THE SHOULDER:res-rere-m6vj3tuq@mercedes-benz.com,MBTMY THE PINNACLE:res-rere-m6vhxd4c@mercedes-benz.com,MBTMY THE DESCENT:res-rere-m6vzgysp@mercedes-benz.com" --format json

node src/cli/dist/main.js run timetracking/report --month 2026-07 --format json
node src/cli/dist/main.js run tokenmaster/clients-list --format table
node src/cli/dist/main.js run tokenmaster/clients-list --region emea --format table
node src/cli/dist/main.js run tokenmaster/client-trustedby --clientid 3562D247-46AA-44E3-A0ED-ADF5A4C954F1 --format table
node src/cli/dist/main.js run uis/mic-user-information --userId SATHIEN --format json
node src/cli/dist/main.js run alice/role-list --userId SATHIEN --format json
node src/cli/dist/main.js run gcs/kb-pages --format table
node src/cli/dist/main.js run gcs/kb-content --path general-security/edr/ --format json
node src/cli/dist/main.js run socket/security-news --format table
node src/cli/dist/main.js run wiz/blog-security --format table
node src/cli/dist/main.js run tldrsec/newsletter --format table
node src/cli/dist/main.js run simonwillison/blog --format table
node src/cli/dist/main.js run simonwillison/blog --tag ai --format json
node src/cli/dist/main.js run every/newsletter --format table
node src/cli/dist/main.js run every/newsletter --sort popular --format json
node src/cli/dist/main.js run mtslive/archive --format table
node src/cli/dist/main.js run mtslive/archive --limit 25 --format json
```

### Linking globally (optional)

To make `cg` / `commandgarden` available on PATH:

```bash
npm link --workspace=src/cli
```

After linking, use `cg` commands as documented in the [Setup](#setup) section.

> **Windows note:** `npm link` creates a directory junction. Node.js ESM may not resolve junctions when computing `import.meta.url`, causing the CLI to find sibling packages (daemon, app) via package resolution instead of the relative monorepo path. If the daemon fails with `ERR_MODULE_NOT_FOUND`, ensure `resolve-script.ts` uses `realpathSync` to resolve the junction before computing relative paths (this is the current behavior). Always **rebuild before re-linking**: `npm run build && cd src/cli && npm link`.

### GUI development

```bash
cd src/app && npm run dev
```

This starts Vite (HMR on `:5173`) and the app server (`tsx watch`) concurrently. The Vite dev server proxies `/api` requests to the app server on `:9092`.

### Connector development cycle

Built-in connectors (in `connectors/`) are copied into the daemon at build time. After editing source YAML or extension code, you need a **3-step reload**:

```bash
npm run build              # copies connectors, rebuilds extension
cg down && cg up           # daemon reloads connector registry
# Then: chrome://extensions → reload commandGarden extension
```

**YAML-only changes** can skip the Chrome reload. For rapid iteration, place WIP connectors in `~/.commandgarden/connectors/` — the daemon loads from there too (same `site/name` key overrides the built-in version), no rebuild needed.

See [Connector Authoring Guide — Development Cycle](docs/connector-authoring.md#development-cycle-source-connectors) for details.

### Watch mode for tests

```bash
npm run test:watch -w src/daemon    # re-runs on file changes
npm run test:watch -w src/chrome
npm run test:watch -w src/app
```

---

## Project Structure

```
cli-garden/
  src/
    shared/      Shared types — connector schema (Zod), protocol messages,
                 audit events, expression parser, pipeline definitions
                 (bundled into CLI at build time, not published separately)
    daemon/      Local HTTP + WebSocket server (Fastify) — auth token
                 management, connector registry, capability validation,
                 audit store (SQLite), WebSocket relay to extension
    cli/         CLI client (Commander.js) — run, list, inspect, validate,
                 daemon management, GUI management, audit queries, config
                 Published as @commandgarden/cli on npm
    chrome/      Chrome MV3 extension — service worker, content scripts,
                 domain guard, pipeline step execution engine
    app/         Web GUI — Fastify app server (facade endpoints, SQLite
                 store for preferences/views) + React SPA (Vite, Tailwind,
                 DaisyUI) with 12 pages including app pages, architecture,
                 API reference, and skills
  connectors/    Built-in YAML connector definitions
  docs/          Design specs, guides, and reference documentation
  skills/        Agent skill definitions for connector authoring
  package.json   Workspace root (npm workspaces)
```

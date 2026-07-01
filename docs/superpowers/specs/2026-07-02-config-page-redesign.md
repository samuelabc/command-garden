# Config Page Redesign

Redesign the commandGarden GUI Configuration page from a generic YAML-field editor into a task-oriented settings page with clear labels, descriptions, validation, connector security management, and a raw YAML editor. Also add connector approval status and actions to the Connectors list page.

## Problem

The current Config page mirrors the YAML file structure directly — sections called "daemon", "security", "connectors", "audit", "output" with raw text inputs for every field. This creates several problems:

- No labels, descriptions, or validation — users don't know what fields do or what values are safe
- Array values (like `approvedHighRisk`) use `window.prompt()` for adding items
- Connector approval requires typing connector keys from memory
- No indication of which settings require a daemon restart
- No undo/discard — the only way to reset is a browser refresh
- No relationship between config values and the connectors they affect

## Scope

Four files change:

1. **`Config.tsx`** — full rewrite
2. **`Connectors.tsx`** — add approval status badges and inline "Approve" action
3. **`connectors.ts`** (app server route) — enrich connector responses with security flags
4. **`api.ts`** — extend `Connector` interface with new fields

No new API endpoints. No daemon changes.

## Config Page

### Page layout

A single scrollable page with five task-oriented section cards, a collapsible raw YAML editor at the bottom, and a sticky save footer bar.

### Section 1: Server

Three fields for daemon and app server binding.

| Config key | Label | Input | Helper text | Notes |
|---|---|---|---|---|
| `daemon.host` | Daemon Host | text | IP address the daemon binds to | "requires restart" badge |
| `daemon.port` | Daemon Port | number (1024–65535) | Port the daemon listens on | "requires restart" badge |
| `app.port` | GUI Port | number (1024–65535) | Port the GUI app server listens on | "requires restart" badge |

Fields with the "requires restart" badge show a small `⟳` icon and tooltip. The set of restart-required keys is a client-side constant: `['daemon.host', 'daemon.port', 'app.port']`. After saving any of these fields, a persistent (non-auto-dismissing) banner appears at the top:

> "Some changes require a daemon restart to take effect. Restart with: `cg down && cg up`"

### Section 2: Connector Security

The most complex section. Two parts.

**Part A: Per-connector security table**

The Config page fetches `/api/connectors` alongside `/api/config` on mount. Renders a table of all loaded connectors:

| Column | Source | Description |
|---|---|---|
| Connector | connector key (monospace) | e.g. `timetracking/report` |
| Capabilities | capability badges | e.g. `navigate`, `js_evaluate` |
| Risk | computed from `highRiskCapabilities` | "High" (warning badge) or "Standard" (no badge) |
| Approved | toggle, maps to `security.approvedHighRisk` array | Only shown for high-risk connectors. Others show "—". |
| Auto-Approve | toggle, maps to `security.autoApproveConnectors` array | Tooltip: "Skip approval prompts — pipeline steps execute without confirmation" |

Toggling updates local form state only. Saved with the batch Save button.

**Part B: Capability-level policy**

Below the table, four fields:

| Config key | Label | Input | Helper text |
|---|---|---|---|
| `security.highRiskCapabilities` | High-Risk Capabilities | tag chips + inline text input + Add button | Capabilities that require connector-level approval before first use |
| `security.approvalRequired` | Step Approval Required | tag chips + inline text input + Add button | Capabilities that pause for user confirmation at each pipeline step |
| `security.approvalTimeoutMs` | Approval Timeout (seconds) | number (1–600) | How long to wait for approval before aborting the pipeline |
| `security.extensionId` | Extension ID | text | Chrome extension ID for origin validation. Leave blank to accept any extension. |

`approvalTimeoutMs` displays as seconds (divide by 1000 on load, multiply by 1000 on save). The raw YAML editor shows the true millisecond value.

Tag chips for `highRiskCapabilities` and `approvalRequired` use an inline text input with an "Add" button, replacing the current `window.prompt()` pattern. Each chip has a remove button.

### Section 3: Connector Sources

`connectors.paths` — rendered as an ordered list of path entries, each with a remove button. Below the list, an inline text input + "Add path" button. Helper text: "Directories to scan for connector YAML files. Use `~/` for home directory paths."

### Section 4: Audit & Retention

| Config key | Label | Input | Helper text |
|---|---|---|---|
| `audit.retentionDays` | Retention Period | number (1–3650) | Days to keep audit log entries before cleanup |
| `audit.dbPath` | Database Path | text (visually de-emphasized) | Path to the audit SQLite database. Change only if you need a custom location. |

`dbPath` uses a muted input style to signal it rarely needs changing.

### Section 5: Output Defaults

| Config key | Label | Input | Helper text |
|---|---|---|---|
| `output.defaultFormat` | Default Output Format | dropdown: table, json, csv | Format used when no --format flag is specified |

### Raw Config Editor

A collapsible section at the bottom, collapsed by default. Title: "Raw Configuration (YAML)".

When expanded, shows:
- A monospaced `<textarea>` displaying the full `config.yaml` contents, auto-populated from the current form state
- An "Apply to form" button that parses the YAML and updates all form fields

The form is the source of truth. Save always saves the form state. The raw editor is a one-way import tool: edit YAML, click "Apply to form" to push changes into the structured form. Expanding the section re-populates the textarea from the current form state.

If the YAML is invalid (parse error), "Apply to form" shows the error inline and does not apply.

No new dependencies — a styled `<textarea>` with `font-mono` class.

### Sticky save footer

A bar fixed to the bottom of the viewport. Appears only when the form has unsaved changes (any field differs from the server state). Contains:

- Change count: "N unsaved changes"
- **Save Changes** button — iterates changed fields, calls `POST /api/config` for each (existing sequential pattern)
- **Discard** button — resets all form state to the last-saved server state

On successful save, the bar disappears and a success toast shows. On error, the bar stays and an error toast shows.

### Validation

Client-side validation mirrors the daemon's Zod schema constraints:
- Port fields: integer, min 1024, max 65535 (HTML5 `min`/`max` attributes)
- `retentionDays`: integer, min 1, max 3650
- `approvalTimeoutMs`: displayed as seconds, min 1, max 600
- `daemon.host`: non-empty string

If the daemon rejects a value that passed client validation, the error toast from the save response handles it.

### Data loading

On mount, two parallel fetches:
- `GET /api/config` — populates all form fields
- `GET /api/connectors` — populates the connector security table

Both must succeed for the page to render. If either fails, show the existing "daemon may not be running" message.

## Connectors Page Changes

Each connector card gets a security status indicator:

- **High-risk, not approved:** Amber badge "Blocked — requires approval" + an "Approve" action button
- **High-risk, approved:** Green "Approved" badge
- **Not high-risk:** No badge (unchanged)

The "Approve" button saves immediately (not batched) by:
1. Reading the current `approvedHighRisk` array from a config fetch on mount
2. Appending the connector key
3. Calling `POST /api/config` with the updated array
4. Refreshing connector data to update the badge

This is the "linked" surface — approvals can be managed from either the Config page or the Connectors page, both writing to the same `security.approvedHighRisk` config value.

The Connectors page fetches `/api/config` on mount (lightweight, same as Config page) to have the raw `approvedHighRisk` array available for the write path. The enriched `isApproved` flag on the connector response handles the display path.

## App Server Changes

### Connector route enrichment

`connectors.ts` enriches each connector in the `/api/connectors` response by fetching config and cross-referencing:

```typescript
// Added to the existing enrichment in connectorRoutes
const configData = await daemon.get<{ ok: boolean; config: Record<string, Record<string, unknown>> }>('/api/config');
const security = configData.config.security ?? {};
const highRiskCaps = new Set((security.highRiskCapabilities as string[]) ?? ['js_evaluate', 'cookie_write']);
const approvedHighRisk = new Set((security.approvedHighRisk as string[]) ?? []);
const autoApproveConnectors = new Set((security.autoApproveConnectors as string[]) ?? []);

// Per connector:
const isHighRisk = connector.capabilities.some(cap => highRiskCaps.has(cap));
const isApproved = approvedHighRisk.has(connector.key);
const isAutoApproved = autoApproveConnectors.has(connector.key);
```

### API client interface

Three new fields on `Connector`:

```typescript
export interface Connector {
  // ... existing fields
  isHighRisk: boolean;
  isApproved: boolean;
  isAutoApproved: boolean;
}
```

## What's not included

- Daemon restart endpoint — not needed for v1. Badge + CLI instruction is sufficient.
- Batch config save endpoint — sequential per-key saves are fine for ~15 fields.
- Syntax-highlighted code editor — plain textarea is sufficient.
- Dark/light theme toggle — deferred per GUI design spec.
- Config file watching (live reload when edited outside GUI) — not needed.

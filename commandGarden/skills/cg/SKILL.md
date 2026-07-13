---
description: "Run commandGarden connectors via `cg` to query enterprise data from authenticated browser sessions. Use when the user mentions `cg`, commandGarden, connectors, or wants to fetch timetracking, room availability, security news, or data behind SSO."
---

`cg` queries enterprise websites through **connectors** — declarative YAML pipelines executed via a Chrome extension using the user's live browser session. No credentials stored.

## Workflow

### 1. Verify readiness

Run `cg daemon status`. Proceed only when output shows "Daemon: running" and "Extension: connected". If not running, run `cg up`.

### 2. Discover

Run `cg list` to see all installed connectors. Each connector has a key in `site/name` format (e.g. `timetracking/report`). Filter large output: `cg list | Select-String "keyword"` (PowerShell) or `cg list | grep -i "keyword"` (bash).

### 3. Inspect

Run `cg inspect <site/name>` before running any connector. Shows required arguments, defaults, output columns, and pipeline steps. Never guess argument names.

### 4. Run

```
cg run <site/name> --format json [--arg value ...]
```

**Always `--format json`**. Output shape:

```json
{"ok": true, "connector": "site/name", "rowCount": N, "columns": [...], "data": [{...}, ...]}
```

### 5. Parse

Read the `data` array from JSON output. Column names match `columns`. `rowCount` confirms expected cardinality.

Errors return plain text starting with `Error:` — not JSON.

## Connectors

| Key | Description | Args |
|-----|-------------|------|
| `ado/git-commits` | ADO Git commits & PRs for a date range | `org`, `project`, `repo`, `fromDate`, `toDate`, `author` |
| `gcs/kb-pages` | GCS Knowledge Base page index | — |
| `gcs/kb-content` | Retrieve one GCS KB page as Markdown | `path` |
| `jira/my-tickets` | Jira tickets assigned to user | `fromDate`, `toDate`, `assignee` |
| `outlook/my-meetings` | User's Outlook Calendar for a day | `date` |
| `saba/pending-training` | Pending mandatory training from Saba | — |
| `socket/security-news` | Latest security news from Socket.dev | `tag` (optional) |
| `teams/room-availability` | Room free/busy for one room | `room`, `date` |
| `teams/rooms-availability` | Room free/busy for multiple rooms | `rooms`, `email`, `date` |
| `timetracking/projects` | Available projects & activities | `month` |
| `timetracking/report` | Monthly time-tracking report | `month` |
| `tldrsec/newsletter` | tl;dr sec newsletter issues | — |
| `tokenmaster/client-trustedby` | Clients that trust a given client | `clientid`, `region` |
| `tokenmaster/clients-list` | Clients managed by current user | `region` |
| `wiz/blog-security` | Wiz security blog posts | `tag` (optional) |

## Errors

| Output contains | Fix |
|---|---|
| "not running" / "No session token" | `cg up` |
| "not connected" | Open Chrome with the extension loaded |
| "not approved" | Add connector key to `security.approvedHighRisk` in `~/.commandgarden/config.yaml` |
| "back/forward cache" | Retry the command |

## Commands

| Command | What it does |
|---|---|
| `cg up` / `cg down` | Start / stop all services |
| `cg daemon status` | Health check (daemon + extension) |
| `cg list` | All installed connectors |
| `cg inspect <key>` | Connector args, columns, pipeline |
| `cg run <key> --format json` | Execute a connector |
| `cg validate <file>` | Validate a connector YAML file |
| `cg audit list --since <dur>` | Recent audit events (e.g. `7d`, `1h`) |
| `cg audit export --format json --since <dur>` | Export audit events as JSON |
| `cg config show` | View current configuration |

## Writing connectors

Use the [connector-authoring skill](../connector-authoring/SKILL.md) for the full recon→scaffold→implement→debug→polish sequence. Reference docs: [`connector-authoring.md`](../../docs/connector-authoring.md) and [`pipeline-reference.md`](../../docs/pipeline-reference.md). Place new connector YAML files in `~/.commandgarden/connectors/`. Validate with `cg validate <file>` before use.

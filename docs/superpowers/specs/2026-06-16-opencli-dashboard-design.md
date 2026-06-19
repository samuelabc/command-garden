# opencli Dashboard — Design Spec

- **Date:** 2026-06-16
- **Status:** Approved (design); pending implementation plan
- **Owner:** local single-user tool
- **Scope:** A local web dashboard that triggers `opencli` commands, shows aggregated Time Tracking and Room Availability results, and records an audit log of every run.

## 1. Purpose & Context

`opencli` (v1.8.3, installed globally) turns internal web apps into CLI commands by driving the user's **already-signed-in Chrome session**. Two adapters exist in this repo:

- `opencli timetracking report [--month YYYY-MM | --months N] --format json` — one row per booking line (`month, date, weekday, projectId, category, activity, hours, status, journalId, lineNumber`).
- `opencli teams roomfreebusy --room <name|email> [--date YYYY-MM-DD] --format json` — one row per timeline block (`room, date, state, start, end, durationMin`).

Because opencli reuses the local logged-in browser, the dashboard is a **local, single-user** tool. No dashboard login is required; it relies on the user being signed into Chrome (opencli's existing requirement).

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Deployment model | **Local single-user**. Backend spawns opencli locally, reuses logged-in Chrome. No dashboard auth. |
| 2 | Time Tracking aggregation | **By project + category** (sum hours, count lines) within selected month(s), plus grand total and an expandable raw-rows table. |
| 3 | Audit storage | **SQLite** file via TypeORM + better-sqlite3. |
| 4 | Command execution | **Synchronous + spinner**. One HTTP response per run, 120s timeout. |
| 5 | opencli invocation | **Spawn the installed `opencli` binary** with `--format json`, parse stdout. Code lives in a new `dashboard/` folder; `clis/` and `sites/` untouched. |

## 3. Architecture

```
dashboard/
  api/    NestJS — REST API, spawns opencli, writes SQLite audit log   (port 3001)
  web/    Next.js (App Router) + Tailwind + daisyUI — dashboard UI      (port 3000)
```

- Front-end calls back-end over REST.
- Back-end spawns `opencli <site> <cmd> ... --format json`, parses stdout, records each run in SQLite, returns results.
- Single user, no login. Existing repo layout (`clis/`, `sites/`, root docs) is left intact.

### Data flow (one run)

```
UI form → POST /api/... → OpencliService spawns `opencli ... --format json`
       → parse stdout → (aggregate, for timetracking) → write audit row
       → JSON response → UI renders
```

Failures still write an audit row and return a structured error the UI can explain.

## 4. Back-end (NestJS)

### 4.1 OpencliService (the only spawner)

- Builds argv as an **array** (never a shell string) → no shell injection.
- Enforces a **120s timeout**; on timeout, kills the child and returns `status=error` ("command timed out").
- Captures `stdout`, `stderr`, `exitCode`.
- Parses JSON from stdout. On malformed/empty stdout → `status=error` with a stderr tail for debugging.
- Maps opencli error signals to typed statuses: `AUTH_REQUIRED → auth_required`, `EMPTY_RESULT → empty`, `UPSTREAM/ARGUMENT/other → error`.
- Returns a discriminated result: `{ status, data?, rowCount, durationMs, exitCode, errorCode?, errorMessage? }`.

> Integration note: the exact `--format json` envelope (bare array vs wrapped object) is verified during implementation, since running opencli requires the user's live login. `OpencliService` normalizes to `data: row[]`.

### 4.2 Timetracking module

- `POST /api/timetracking/report` body `{ month?: string, months?: number }`.
- Calls `OpencliService`, then **aggregates** raw rows:
  - Group by `(projectId, category)` → `{ projectId, category, totalHours, lineCount }`.
  - `grandTotalHours`, `totalLines`.
  - Returns `{ aggregated: Group[], grandTotalHours, totalLines, raw: Row[], meta }`.

### 4.3 Teams module

- `POST /api/teams/roomfreebusy` body `{ room: string, date?: string }`.
- Returns timeline rows as-is plus `meta`.

### 4.4 Audit module

- TypeORM entity `AuditLog` backed by better-sqlite3 (file e.g. `dashboard/api/data/audit.sqlite`).
- Every run (success or failure) writes one row.
- `GET /api/audit?limit&offset&status&command` — paginated, newest first, optional filter by `status` and `command`.

**`audit_log` columns:**

| column | type | notes |
|--------|------|-------|
| `id` | integer PK | autoincrement |
| `timestamp` | datetime | run start (ISO) |
| `command` | text | e.g. `timetracking report` |
| `argsJson` | text | JSON of the args used |
| `status` | text | `success` \| `auth_required` \| `empty` \| `error` |
| `exitCode` | integer | child process exit code (nullable) |
| `durationMs` | integer | wall-clock duration |
| `rowCount` | integer | rows returned (0 on failure) |
| `errorCode` | text | opencli error code if any (nullable) |
| `errorMessage` | text | short message (nullable) |

### 4.5 Validation

`class-validator` DTOs reject bad input before it reaches the CLI:

- `month`: optional, matches `^\d{4}-(0[1-9]|1[0-2])$`.
- `months`: optional integer 1–6.
- `date`: optional, matches `^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$`.
- `room`: required non-empty string.

## 5. Front-end (Next.js App Router + Tailwind + daisyUI)

- **Layout** — daisyUI `drawer` sidebar + `navbar`, theme toggle. Nav: Time Tracking, Room Availability, Audit Log.
- **Time Tracking page** — month picker or last-N-months selector → Run → spinner → daisyUI `stats` (grand total hours), a **grouped table by project + category**, and a collapsible raw-rows table.
- **Room Availability page** — room input + date picker → Run → spinner → timeline as colored rows/badges (`free`/`busy`/`tentative`/`oof`/`elsewhere`).
- **Audit Log page** — paginated table with status badges, filters (command, status), expandable row showing args + error.
- **Shared** — typed `apiClient`, consistent loading/error states, and an `AuthRequired` callout ("Open Chrome and sign in, then retry") for the most common failure.

## 6. Error handling

- Non-zero exit / opencli error code → mapped typed status, friendly UI message (esp. `auth_required`).
- Timeout (120s) → killed child, `status=error`, "command timed out".
- Malformed/empty stdout → `status=error` with stderr tail.
- All failures are audited.

## 7. Tech stack

- **api:** NestJS 10, TypeORM + better-sqlite3, class-validator, Jest + supertest.
- **web:** Next.js 14 (App Router), React 18, Tailwind CSS + daisyUI, Lucide icons, Vitest + Testing Library + MSW.

## 8. Test cases

### 8.1 api — OpencliService (unit, `child_process` mocked)

- TC-OS-1: valid JSON array on stdout, exit 0 → `status=success`, `data` parsed, `rowCount` correct.
- TC-OS-2: stderr contains `AUTH_REQUIRED`, non-zero exit → `status=auth_required`.
- TC-OS-3: `EMPTY_RESULT` signal → `status=empty`, `rowCount=0`.
- TC-OS-4: child exceeds 120s → child killed, `status=error`, message "command timed out".
- TC-OS-5: malformed (non-JSON) stdout → `status=error`, stderr tail included.
- TC-OS-6: argv built as array; args with spaces/quotes are passed safely (no shell injection).

### 8.2 api — Timetracking aggregation (unit)

- TC-AGG-1: rows across 2 projects × 2 categories → correct per-group `totalHours`/`lineCount`.
- TC-AGG-2: `grandTotalHours` equals sum of all row hours; `totalLines` equals row count.
- TC-AGG-3: empty raw rows → empty `aggregated`, `grandTotalHours=0`.
- TC-AGG-4: null/missing `hours` treated as 0 without NaN.

### 8.3 api — Audit (unit, in-memory sqlite)

- TC-AUD-1: a successful run writes one row with `status=success` and correct `rowCount`/`durationMs`.
- TC-AUD-2: a failed run writes one row with `status=error` and `errorCode`/`errorMessage`.
- TC-AUD-3: `GET /api/audit` returns newest-first, paginated by `limit`/`offset`.
- TC-AUD-4: filter by `status` and `command` returns only matching rows.

### 8.4 api — DTO validation

- TC-VAL-1: invalid `month` (`2026-13`) → 400.
- TC-VAL-2: `months=7` → 400; `months=3` → ok.
- TC-VAL-3: invalid `date` → 400.
- TC-VAL-4: empty `room` → 400.

### 8.5 api — e2e (supertest, OpencliService mocked)

- TC-E2E-1: `POST /api/timetracking/report` happy path → 200 with `aggregated` + `raw`.
- TC-E2E-2: `POST /api/teams/roomfreebusy` happy path → 200 with timeline.
- TC-E2E-3: auth error → HTTP **200** with structured body `{ status: "auth_required", errorMessage }` (auth-not-ready is a normal operational state, not a 5xx; UI keys off the `status` field).
- TC-E2E-4: every endpoint call produces an audit row.

### 8.6 web — components (Vitest + Testing Library, MSW)

- TC-WEB-1: Time Tracking grouped table renders per-group totals and grand total from mocked response.
- TC-WEB-2: raw-rows section expands/collapses.
- TC-WEB-3: Room Availability renders timeline blocks with correct state colors.
- TC-WEB-4: Audit Log paginates and filters via controls.
- TC-WEB-5: `auth_required` response shows the AuthRequired callout on each run page.
- TC-WEB-6: loading spinner shows while a run is in flight.

## 9. Out of scope (YAGNI)

- Multi-user / dashboard authentication.
- Async job queue / live progress streaming.
- Exporting/scheduling reports.
- Charts beyond the daisyUI `stats` summary (can be a later enhancement).

## 10. Open items resolved during implementation

- Confirm `--format json` output envelope for each adapter (needs live login); `OpencliService` normalizes to `data: row[]`.
- Confirm `opencli` binary path/launcher on Windows (PowerShell) for `child_process`.

# opencli-poc

Personal [opencli](https://github.com/jackwener/opencli) adapters and a local dashboard
that wraps them into a web UI.

## Prerequisites

- **opencli** installed and on PATH (`opencli --version`).
- **Node.js ≥ 18** (for the dashboard).
- Be **signed in** to each target app in your Chrome session — opencli reuses it.

---

## Repository layout

```
clis/                         # adapter source code (JS)
  timetracking/report.js      #   MBTI Time Tracking monthly report
  teams/roomfreebusy.js       #   Teams/Outlook meeting-room free/busy

sites/                        # per-site knowledge (endpoints, field maps, verify fixtures)
  timetracking/
    endpoints.json            #   ReportFAK API memory
    field-map.json            #   field code dictionary
    notes.md                  #   session notes / gotchas
    verify/report.json        #   verify fixture (pinned to 2026-05)
  teams/
    endpoints.json            #   GetSchedule + findmeetinglocations memory
    notes.md                  #   session notes / gotchas
    verify/roomfreebusy.json  #   verify fixture (pinned to 2026-06-12)

dashboard/                    # local web dashboard
  api/                        #   NestJS backend (port 3001)
  web/                        #   Next.js frontend (port 3000)

docs/                         # plans, specs, PRDs
```

---

## Syncing adapters to opencli

opencli loads adapters from `~/.opencli/clis/` and site knowledge from
`~/.opencli/sites/`. This repo is the **canonical source**; after editing, copy
them over:

```powershell
# timetracking
Copy-Item .\clis\timetracking\report.js `
  "$env:USERPROFILE\.opencli\clis\timetracking\report.js" -Force
Copy-Item .\sites\timetracking\* `
  "$env:USERPROFILE\.opencli\sites\timetracking\" -Recurse -Force

# teams
Copy-Item .\clis\teams\roomfreebusy.js `
  "$env:USERPROFILE\.opencli\clis\teams\roomfreebusy.js" -Force
Copy-Item .\sites\teams\* `
  "$env:USERPROFILE\.opencli\sites\teams\" -Recurse -Force
```

> **Tip:** Run the copy commands each time you change an adapter or site file.
> opencli reads from `~/.opencli/` at runtime, not from this repo.

---

## Using the adapters (CLI)

### `timetracking/report`

Fetches the MBTI Time Tracking monthly report (one row per booking line).

```bash
opencli timetracking report                       # current month
opencli timetracking report --month 2026-05       # specific month (YYYY-MM)
opencli timetracking report --months 3            # last N months (1-6)
opencli timetracking report --month 2026-05 --format json
```

**How it works:** The app is an Azure AD / MSAL SPA. Strategy `COOKIE` — opencli
navigates to the app, reads the cached access token from `sessionStorage`, and
`fetch`es the report API (`ReportFAK`) from page context.

### `teams/roomfreebusy`

Returns the free/busy timeline for one meeting room on a given day.

```bash
opencli teams roomfreebusy --room "MBTMY The Vista"                            # today
opencli teams roomfreebusy --room "MBTMY The Summit" --date 2026-06-18
opencli teams roomfreebusy --room RES-RERE-M6VJ7ZUW@mercedes-benz.com --format json
```

- `--room` — room **name** (resolved via room finder) or mailbox **email**
  (resolved via attendee picker). Names with spaces must be quoted.
- `--date` — `YYYY-MM-DD`, defaults to today.

**How it works:** Strategy `COOKIE` + UI drive + intercept. Direct API replay
returns 401, so the adapter drives the Scheduling Assistant, adds the room, and
intercepts the page's own `getSchedule` GraphQL response.

### Auth errors

Both adapters throw `AUTH_REQUIRED` if the browser session is not signed in. Fix:
open the target app in Chrome, log in, then retry.

---

## Verifying adapters

Each adapter has a pinned verify fixture under `sites/<site>/verify/`.

```bash
opencli browser verify timetracking/report --strict-memory   # pinned to 2026-05
opencli browser verify teams/roomfreebusy                    # pinned to 2026-06-12
```

---

## Starting the dashboard

The dashboard is a local web app with a **NestJS** API and a **Next.js** frontend.
It calls `opencli` under the hood, so adapters must be synced first (see above).

### 1. Install dependencies (first time only)

```powershell
cd dashboard\api; npm install
cd dashboard\web; npm install
```

### 2. Start the servers (two terminals)

```powershell
# Terminal 1 — API (http://localhost:3001)
cd dashboard\api
npm run start:dev

# Terminal 2 — Web (http://localhost:3000)
cd dashboard\web
npm run dev
```

### 3. Open the UI

Navigate to **http://localhost:3000**. The home page redirects to the
Time Tracking view. Pages: `/timetracking`, `/rooms`, `/audit`.

### Running tests

```powershell
cd dashboard\api; npm test; npm run test:e2e
cd dashboard\web; npm test
```

### Notes

- Audit log persists to `dashboard/api/data/audit.sqlite`.
- Commands can take 10–60 s because opencli drives a real browser; the UI shows a spinner.
- If you see "Sign-in required", open Chrome, log in, and retry.

---

## Creating a new adapter

Follow these steps to add a new adapter for a site (e.g. `mysite/mycommand`).

### 1. Create the site knowledge folder

```
sites/mysite/
  endpoints.json       # discovered API endpoints (URL, method, params, auth, response shape)
  notes.md             # session notes, auth gotchas, UI quirks
  verify/
    mycommand.json     # verify fixture (pin to a stable, frozen data point)
```

- **`endpoints.json`** — document each API endpoint you plan to use: URL, method,
  required/optional params, auth mechanism, and response shape. See
  `sites/timetracking/endpoints.json` for a good example.
- **`notes.md`** — record anything an AI agent or future-you needs to know:
  auth flow, token locations, CORS behaviour, UI element selectors, gotchas.
- **`verify/<command>.json`** — a fixture with `args` and `expect` (row count
  range, column names, types, regex patterns). Pin to a frozen past data point
  so the fixture stays stable.

### 2. Write the adapter

Create `clis/mysite/mycommand.js`:

```js
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, EmptyResultError, CliError } from '@jackwener/opencli/errors';

cli({
  site: 'mysite',
  name: 'mycommand',
  access: 'read',                          // or 'write'
  description: 'One-line description',
  example: 'opencli mysite mycommand --flag value',
  domain: 'mysite.example.com',
  strategy: Strategy.COOKIE,               // reuse browser session
  browser: true,
  args: [
    { name: 'flag', type: 'string', default: '', help: 'Description' },
  ],
  columns: ['col1', 'col2'],               // output columns
  func: async (page, args) => {
    // 1. Navigate / wait for auth
    // 2. Extract or intercept data
    // 3. Return array of row objects matching `columns`
    return [{ col1: 'value', col2: 42 }];
  },
});
```

**Key patterns from existing adapters:**

| Pattern | When to use | Example |
|---------|-------------|---------|
| Page-context `fetch` | Token is JS-readable (sessionStorage/localStorage) | `timetracking/report` |
| UI drive + intercept | API requires httpOnly cookies or per-request canaries that can't be replayed | `teams/roomfreebusy` |

### 3. Sync and test

```powershell
# Copy to opencli runtime
Copy-Item .\clis\mysite\mycommand.js `
  "$env:USERPROFILE\.opencli\clis\mysite\mycommand.js" -Force
Copy-Item .\sites\mysite\* `
  "$env:USERPROFILE\.opencli\sites\mysite\" -Recurse -Force

# Run it
opencli mysite mycommand --flag value

# Verify
opencli browser verify mysite/mycommand
```

### 4. (Optional) Add a dashboard page

If the adapter should appear in the dashboard, add a NestJS module under
`dashboard/api/src/mysite/` and a Next.js page under `dashboard/web/app/mysite/`.
Follow the existing `timetracking` or `teams` modules as templates.

---

## Per-adapter reference

Detailed notes, endpoint schemas, and field maps live in each site's folder:

| Adapter | Site notes | Endpoints | Field map |
|---------|-----------|-----------|-----------|
| `timetracking/report` | `sites/timetracking/notes.md` | `sites/timetracking/endpoints.json` | `sites/timetracking/field-map.json` |
| `teams/roomfreebusy` | `sites/teams/notes.md` | `sites/teams/endpoints.json` | — |

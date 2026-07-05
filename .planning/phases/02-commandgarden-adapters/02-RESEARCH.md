# Phase 2: commandGarden Adapters — Research

**Researched:** 2026-07-06
**Status:** Complete

## Connector System Architecture

Every commandGarden connector consists of:
1. **YAML definition** — declares site, name, domains, capabilities, args, columns, pipeline
2. **Eval script** (`.eval.js`) — JavaScript that runs in the target page's context via `js_evaluate`

### YAML Schema

```yaml
site: <site-name>           # e.g. "teams", "timetracking"
name: <connector-name>      # e.g. "room-availability", "report"
version: "1.0"
description: "..."
access: read                # read | write

domains:                    # allowlisted domains the extension can access
  - "example.com"
capabilities:               # pipeline steps used
  - navigate
  - js_evaluate

args:                       # user-supplied arguments
  - name: <argName>
    type: string | number
    required: true | false
    help: "..."
    pattern: "regex"        # optional validation

columns:                    # output schema (returned rows must match)
  - name: <colName>
    type: string | number

pipeline:                   # execution steps
  - step: navigate
    url: "https://..."
  - step: wait
    selector: "body"
    timeout: 10000
  - step: js_evaluate
    file: <eval-script>.eval.js
```

### Eval Script Patterns

Two main patterns exist in the codebase:

**Pattern 1 — MSAL Token + REST API** (timetracking connectors):
- Navigate to the web app (triggers SSO/MFA)
- Poll sessionStorage for MSAL access token (up to 60s)
- Call the app's own REST API with the captured token
- Return structured rows

**Pattern 2 — UI Driving + Fetch Intercept** (teams/room-availability):
- Navigate to the web app
- Monkey-patch `window.fetch` to intercept GraphQL responses
- Drive UI elements (click buttons, type into inputs, navigate calendar)
- Read intercepted data from captured responses
- Return structured rows

**Template variables:** `${{ args.room }}`, `${{ args.date | default("") }}` — interpolated before execution.

### Shared Library

`connectors/lib/msal-token.js` — reusable MSAL token polling snippet (copy-pasted into eval files, not imported).

## Connector 1: ADO Git (ado/git-commits)

### Target: Azure DevOps Web UI

**Domain:** `dev.azure.com`
**Auth:** MSAL SSO (enterprise Azure AD — same as timetracking)
**Data needed:** Commits and PRs for configured repos within a date range

### Approach: MSAL Token + REST API (Pattern 1)

ADO's web UI uses MSAL tokens stored in sessionStorage (same pattern as timetracking). Navigate to `https://dev.azure.com/{org}` to trigger SSO, poll for token, then call the same REST APIs that the Phase 1 git.source.ts already uses:

- `GET /git/repositories/{repo}/pushes` — list pushes in date range
- `GET /git/repositories/{repo}/pushes/{pushId}` — get push commits
- `GET /git/repositories/{repo}/pullrequests` — completed PRs

**Advantages over current PAT approach:**
- No PAT needed — reuses browser session
- Same API surface — response parsing is identical
- User's ADO auth already active if they use ADO daily

**Args:** `project` (required), `repo` (required), `fromDate` (required), `toDate` (required), `author` (optional, defaults to current user)

**Columns:** `commitId`, `authorName`, `authorEmail`, `date`, `message`, `filesChanged`, `isPR`, `prId`

### Risk

ADO tokens from sessionStorage may have different scopes than PATs. Need to verify the Pushes API works with the browser-session token. If not, fall back to UI-driving (scraping the commit list page).

## Connector 2: Outlook Calendar (outlook/my-meetings)

### Target: Outlook Web App (OWA)

**Domain:** `outlook.cloud.microsoft.mcas.ms` (same as teams/room-availability)
**Auth:** Existing OWA session
**Data needed:** User's own meetings for a date range (subject, time, duration)

### Approach: Fetch Intercept (Pattern 2 variant)

Reuse the existing `teams-room-availability` approach but for the user's OWN calendar:
- Navigate to Outlook calendar compose deeplink (same URL)
- The Scheduling Assistant automatically fires a `getSchedule` call for the organizer's own email
- Intercept those `getSchedule` responses (already captured by the existing fetch interceptor)
- The organizer's `scheduleItems` contain their meetings

**Key difference from room-availability:** No need to add an attendee — the organizer's schedule loads automatically. Just navigate to the compose form, open the Scheduling Assistant, and capture the organizer's own scheduleItems.

**Args:** `date` (required, YYYY-MM-DD), `dateRange` (optional, number of days, default 1)

**Columns:** `date`, `subject`, `start`, `end`, `durationMin`, `state`

### Risk

The `getSchedule` response for the organizer may not include `subject` — it's a free/busy API. If subjects are missing, meetings will show as "(meeting)" blocks. This is acceptable for the journal's meeting count/hours metrics. Subject details can be added later via a different OWA API endpoint.

## Connector 3: Jira (jira/my-tickets)

### Target: Jira Cloud Web UI OR Azure DevOps Boards

**Decision:** The Phase 1 `jira.source.ts` actually uses ADO Work Items API (WIQL), not Jira. The naming is "jira" because of future Jira migration plans. For the connector, we should match what's actually used.

**Domain:** `dev.azure.com` (same as ADO Git)
**Auth:** MSAL SSO (same token works)
**Data needed:** Work items assigned to the user — resolved, in-progress, blockers

### Approach: MSAL Token + REST API (Pattern 1)

Same approach as ADO Git connector. Navigate to ADO, poll for MSAL token, call WIQL API:

- `POST /_apis/wit/wiql` — run WIQL query
- `GET /_apis/wit/workitems?ids=...` — batch fetch details

**Args:** `fromDate` (required), `toDate` (required), `assignee` (optional)

**Columns:** `id`, `title`, `state`, `type`, `resolvedDate`, `stateChangeDate`, `staleDays`

## File Structure

```
commandGarden/connectors/
  ado-git-commits.yaml
  ado-git-commits.eval.js
  outlook-my-meetings.yaml
  outlook-my-meetings.eval.js
  jira-my-tickets.yaml          # actually ADO Work Items
  jira-my-tickets.eval.js
```

## Dependencies

- All 3 connectors need the Chrome extension running with the browser logged into ADO and Outlook
- Connectors are tested via `cg run ado/git-commits --project X --repo Y --fromDate ... --toDate ...`

## RESEARCH COMPLETE

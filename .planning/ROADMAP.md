# Roadmap: Dev Work Journal

**Created:** 2026-07-05
**Deadline:** 2026-07-14 (first round presentation)
**Phases:** 5 (coarse granularity, 9-day sprint)

## Phase Overview

| Phase | Name | Days | Requirements | Dependency |
|-------|------|------|-------------|------------|
| 1 | Migration to commandGarden | Jul 6–7 | MIG-01 to MIG-04 | None |
| 2 | commandGarden Adapters | Jul 8–10 | ADPT-01 to ADPT-05 | Phase 1 |
| 3 | Journal Backend + Frontend | Jul 10–11 | BACK-01 to BACK-05, FRONT-01 to FRONT-06 | Phase 1, Phase 2 |
| 4 | LLM Integration | Jul 12 | AI-01 to AI-03 | Phase 3 |
| 5 | Demo Polish | Jul 13–14 | DEMO-01 to DEMO-03 | Phase 4 |

---

## Phase 1: Migration to commandGarden

**Goal:** Move journal module from `dashboard/` (NestJS + Next.js) to `commandGarden/app/` (Fastify + React/Vite). All subsequent work happens in the correct codebase.

**Timeline:** Jul 6–7 (2 days)

**Requirements:** MIG-01, MIG-02, MIG-03, MIG-04

### Plan 1.1: Backend Migration

Port journal backend from NestJS to Fastify:
- Create `commandGarden/app/src/server/routes/journal.ts` — Fastify route handler for `POST /api/journal/generate`
- Port `journal.types.ts`, `journal.config.ts` (env-var driven) as-is
- Port `journal.service.ts` (orchestrator, cross-reference, insights) as-is
- Port all 4 source files (`git.source.ts`, `jira.source.ts`, `meetings.source.ts`, `timetracking.source.ts`)
- Replace `OpencliService` (spawns `opencli` CLI) with daemon HTTP client (already available in app server)
- Wire the route into the app server's Fastify instance
- Verify: `cg up` → `POST /api/journal/generate` returns data

### Plan 1.2: Frontend Migration

Port journal frontend from Next.js to React SPA:
- Create journal page component in `commandGarden/app/src/client/pages/`
- Port `SummaryCards.tsx`, `DailyBreakdown.tsx`, `InsightsPanel.tsx` (remove `'use client'`, adjust imports)
- Port `page.tsx` logic (week picker, generate button, state management)
- Add route to Vite SPA router
- Add "Dev Journal" to the GUI sidebar navigation
- Verify: `cg up` → navigate to journal page → UI renders

**Success criteria:**
- [x] `cg up` starts daemon + app server + GUI
- [x] Journal page accessible in commandGarden GUI
- [x] `POST /api/journal/generate` returns data (Git source via existing REST API as baseline)

---

## Phase 2: commandGarden Adapters

**Goal:** Build 3 new commandGarden connectors so all data sources work via browser automation (no tokens).

**Timeline:** Jul 8–10 (3 days)

**Requirements:** ADPT-01, ADPT-02, ADPT-03, ADPT-04, ADPT-05

### Plan 2.1: ADO Git Connector (IN PROGRESS)

Build a commandGarden YAML connector + eval script for Azure DevOps Git:
- Navigate to ADO commits page, intercept page's own API responses
- Return: commit ID, author, date, message, files changed
- YAML: domains, capabilities, args (org, project, repo, fromDate, toDate)
- **Status:** Connector built but timing out (90s). ADO may need CDP `Fetch.enable` approach like room-availability. Needs `cdp: true` flag + broader URL pattern in Chrome extension.

### Plan 2.2: Outlook Calendar Connector (DEFERRED to v2)

**Deferred** — MCAS proxy (`outlook.cloud.microsoft.mcas.ms`) blocks standard auth patterns:
- OWA REST API: X-OWA-CANARY cookie is HttpOnly
- Graph API: no Graph-scoped MSAL token in MCAS storage
- Response interception: eval installs after initial data fetch
- **May be unblocked** by adding `cdp: true` to connector YAML (Samuel's CDP fix)

### Plan 2.3: Jira Cloud Connector ✓

Build a commandGarden YAML connector for Atlassian Jira Cloud (`mercedes-benz.atlassian.net`):
- Uses Jira REST API v3 with JQL queries via browser session cookies
- Returns: ticket key, summary, status, resolved date, stale days, category
- Assignee defaults to `currentUser()` JQL function
- **Status:** Working ✓ — tested with real tickets

**Success criteria:**
- [ ] ADO Git connector works via `cg run` (blocked — needs CDP)
- [x] Jira connector works via `cg run` with real browser session
- [ ] Outlook connector works (deferred to v2)
- [x] Each connector has YAML definition + eval script

---

## Phase 3: Journal Backend + Frontend

**Goal:** Wire the 3 new connectors into the journal orchestrator and polish the frontend.

**Timeline:** Jul 10–11 (2 days)

**Requirements:** BACK-01 to BACK-05, FRONT-01 to FRONT-06

### Plan 3.1: Backend Wiring

Update journal service to use the 3 commandGarden connectors:
- Replace `git.source.ts` REST API calls with daemon run (`ado/git-commits` connector)
- Replace `jira.source.ts` ADO WIQL calls with daemon run (`jira/my-tickets` connector)
- Update `meetings.source.ts` to use `outlook/my-meetings` connector
- Update cross-reference engine for new data shapes
- Graceful degradation: each source wraps in try/catch, status = "partial" on failure
- Audit log each generation

### Plan 3.2: Frontend Polish

Finalize the journal UI in commandGarden GUI:
- Summary cards with correct data from all 3 sources
- Daily breakdown table with meetings, commits, tickets per day
- Insights panel (rule-based for now, LLM in Phase 4)
- Loading states, error states, partial-data warnings
- Responsive layout matching commandGarden GUI style

**Success criteria:**
- [x] Generate button fetches data from available connectors via daemon
- [x] Page renders weekly report with cross-references (Git data pending ADO connector fix)
- [x] Graceful degradation works when a connector fails (meetings show "—")
- [x] Journal config stored in GUI preferences (no env vars)
- [x] Summary cards show progress bar, blocker count, repo count
- [x] Daily breakdown has totals row

---

## Phase 4: LLM Integration

**Goal:** Replace rule-based insights with actual LLM-powered analysis.

**Timeline:** Jul 12 (1 day)

**Requirements:** AI-01, AI-02, AI-03

### Plan 4.1: LLM-Powered Insights

Integrate an LLM to generate contextual weekly insights:
- Choose LLM approach (local model, Azure OpenAI, or Anthropic API)
- Send only aggregated data to LLM (counts, ratios, patterns — NOT raw content)
- Prompt engineering: generate 3-5 actionable insights per week
- Examples: "Block focus time on Wednesday", "Fill Tuesday timesheet", "3 tickets stale >5 days"
- Fallback to rule-based insights if LLM call fails
- Add LLM config to `.env` (API key, model)

**Success criteria:**
- [ ] LLM generates contextual, actionable insights
- [ ] No sensitive data sent to LLM
- [ ] Fallback to rule-based when LLM unavailable

---

## Phase 5: Demo Polish

**Goal:** End-to-end demo ready for July 14 presentation.

**Timeline:** Jul 13–14 (2 days)

**Requirements:** DEMO-01, DEMO-02, DEMO-03

### Plan 5.1: Demo Preparation

Prepare for a flawless 4-minute demo:
- Test with real data from an actual work week
- Pre-warm all browser sessions (ADO, Outlook, Jira)
- Optimize: Generate should complete within 60 seconds
- Prepare pitch slides (4 min presentation + 4 min Q&A)
- Record backup demo video in case of live failure
- Rehearse Q&A answers (security, privacy, scalability, UI changes)
- Edge cases: empty weeks, auth errors, partial data

**Success criteria:**
- [ ] Live demo works end-to-end with real data
- [ ] Completes in <60 seconds
- [ ] Pitch deck ready
- [ ] Backup video recorded

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| ADO Git adapter too complex for browser automation | Can't show Git data | Fallback to REST API + PAT for round 1, replace for finals |
| Jira web UI changes break adapter | Can't show Jira data | Build adapter against stable Jira Cloud pages; have REST API fallback |
| Outlook adapter can't capture meeting details | Only free/busy blocks, no subjects | Use existing roomfreebusy workaround; show block counts |
| LLM API not available or too slow | No AI insights in demo | Rule-based insights already working as fallback |
| Browser session expires during demo | Auth popup interrupts demo | Pre-warm sessions 5 min before; have backup video |
| Migration takes longer than expected | Less time for adapters | Port backend logic as-is first, refactor later |

---
*Roadmap created: 2026-07-05*
*Last updated: 2026-07-05 after initial definition*

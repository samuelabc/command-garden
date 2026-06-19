# TODO Archive

## 2026-06-15 — Build `teams/roomfreebusy` adapter (meeting-room availability)

Plan: `C:\Users\sathien\.windsurf\plans\teams-room-availability-866e47.md`

- [x] Recon: Teams Calendar = Outlook on the web (OWA) behind MCAS `*.mcas.ms` proxy
- [x] Found free/busy source: OWA GraphQL gateway `POST /outlookgatewayb2/graphql` op `GetSchedule`
- [x] Verify-then-pick strategy → resolved to **Watch/intercept** (replay 401s: httpOnly canary + encrypted MSAL cache)
- [x] Confirmed `getSchedule` contract: `availabilityView` + `scheduleItems` (UTC) + workingHours
- [x] Output = full free/busy timeline (busy/tentative/oof blocks + free gaps), one room per run (user choice)
- [x] `--room` accepts room **name** (room finder) or **email** (attendee picker); `--date` defaults to today
- [x] Timeline built from `scheduleItems` (UTC → local in browser); avoids availabilityView UTC-window mislabel
- [x] Wrote adapter (`COOKIE` + UI drive + intercept, typed errors); robust SA/date/room UI handling
- [x] Verified Vista & Summit, by name & by email, today & 2026-06-18 (name/email agree)
- [x] Seeded verify fixture pinned to 2026-06-12 (Vista, frozen past day) — `opencli browser verify teams/roomfreebusy` passes
- [x] Wrote site memory: endpoints.json, notes.md; README section; synced to `~/.opencli/`

## 2026-06-15 — Build `timetracking/report` adapter

- [x] Recon target site; confirmed Azure AD / MSAL SPA + `ReportFAK` API
- [x] Confirmed auth: MSAL access token in `sessionStorage`, used as Bearer header
- [x] Verified `ReportFAK?date=YYYY-MM-01` returns a full month of day objects
- [x] Decided output = one row per booking line (user choice)
- [x] Decided CLI = `--month` + `--months N` (hard-capped at 6 per run)
- [x] Wrote adapter (`COOKIE` strategy + page-context fetch, typed errors)
- [x] Verified single month, multi-month range, and error paths (bad month, >6 cap)
- [x] Seeded verify fixture pinned to 2026-05 (30 rows, RELEASED) — matches
- [x] Wrote site memory: endpoints.json, field-map.json, notes.md
- [x] `opencli browser verify timetracking/report --strict-memory` passes
- [x] Cleaned temp probe files; organized workspace as opencli mirror

## 2026-06-16 — opencli Dashboard (Next.js + daisyUI + NestJS)

Spec: `docs/superpowers/specs/2026-06-16-opencli-dashboard-design.md`
Plan: `docs/superpowers/plans/2026-06-16-opencli-dashboard.md`

- [x] Tasks 1–3: NestJS API scaffold + OpencliService + SQLite audit entity
- [x] Tasks 4–5: Timetracking report endpoint with DTOs, service, controller, e2e tests
- [x] Task 6: Teams roomfreebusy endpoint with DTOs, service, controller, e2e tests
- [x] Task 7: Audit query endpoint with DTO, controller, e2e tests
- [x] Task 8: Next.js web scaffold (Tailwind, daisyUI, Vitest)
- [x] Task 9: Shared types, API client, layout + nav (Sidebar, Spinner, AuthRequiredCallout)
- [x] Task 10: Time Tracking page + TimetrackingTable component (TDD — TC-WEB-1, TC-WEB-2)
- [x] Task 11: Room Availability page + TimelineView component (TDD — TC-WEB-3)
- [x] Task 12: Audit Log page + AuditTable component (TDD — TC-WEB-4)
- [x] Task 13: Dashboard README + TODO archive

## 2026-06-16 — Time Tracking Goals Feature

Spec: `docs/superpowers/specs/2026-06-16-timetracking-goals-design.md`
Plan: `docs/superpowers/plans/2026-06-16-timetracking-goals.md`

- [x] Task 1: Goal entity (TypeORM, SQLite)
- [x] Task 2: GoalsService + unit tests (5 TCs: create, upsert, findByMonth, delete, delete-nonexistent)
- [x] Task 3: Goal DTOs (CreateGoalDto, GoalQueryDto with class-validator)
- [x] Task 4: GoalsController (GET/POST/DELETE)
- [x] Task 5: GoalsModule + wire into AppModule
- [x] Task 6: Goals e2e tests (9 TCs: validation + CRUD)
- [x] Task 7: Enrich TimetrackingService — inject GoalsService, add goals to report response
- [x] Task 8: Frontend types (Goal interface) + API client (getGoals, upsertGoal, deleteGoal)
- [x] Task 9: Pace calculation helpers with TDD (11 TCs: workingDaysInMonth, workingDaysElapsed, computeGoalProgress)
- [x] Task 10: GoalProgressBar component (daisyUI progress, color-coded by pace)
- [x] Task 11: GoalCards component + tests (3 TCs: render, reached state, empty)
- [x] Task 12: ManageGoals component + tests (2 TCs: collapsed default, expand shows goals)
- [x] Task 13: TimetrackingTable Goal column + tests (4 TCs: goal column visibility)
- [x] Task 14: Wire GoalCards, ManageGoals, TimetrackingTable into TimetrackingPage

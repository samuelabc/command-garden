# Time Tracking Goals — Design Spec

- **Date:** 2026-06-16
- **Status:** Approved (design); pending implementation plan
- **Owner:** local single-user tool
- **Scope:** Add per-project monthly goals to the Time Tracking dashboard page, with progress cards, inline table indicators, and a pace countdown.

## 1. Purpose & Context

The dashboard already shows aggregated time tracking data by project and category. Users need a way to set monthly hour targets per project (e.g., "16.5 days on project X in June") and see at a glance how actual hours compare to the goal — including a countdown of remaining days and a pace hint ("book X hours/day to stay on track").

This builds on the existing dashboard spec (`2026-06-16-opencli-dashboard-design.md`). No changes to the `clis/` or `sites/` directories are needed.

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Day conversion | **8 hours = 1 day** (fixed) |
| 2 | Goal scope | **Per project** (projectId). All categories for that project are summed against a single goal. |
| 3 | Time window | **Monthly** (goal is tied to a specific `YYYY-MM`). |
| 4 | Storage | **SQLite** (new `goals` table in the existing `audit.sqlite` database). |
| 5 | Display | **Goal cards above table** (progress bar, countdown, pace hint) **+ inline progress bars in the grouped table rows**. |
| 6 | Management UI | **Inline collapsible section on the Time Tracking page**. |

## 3. Data Model

New `goals` table in the existing SQLite database (`dashboard/api/data/audit.sqlite`):

| column | type | constraints | notes |
|--------|------|-------------|-------|
| `id` | integer | PK, autoincrement | |
| `month` | text | not null | `YYYY-MM` format, e.g. `2026-06` |
| `projectId` | text | not null | matches `projectId` from report rows |
| `targetDays` | real | not null | user-entered value, e.g. `16.5` |
| `targetHours` | real | not null | computed: `targetDays * 8`, stored for fast queries |
| `createdAt` | datetime | not null, default now | |
| `updatedAt` | datetime | not null, default now | updated on upsert |

**Unique constraint:** `(month, projectId)` — one goal per project per month.

TypeORM entity: `Goal` in `dashboard/api/src/goals/goal.entity.ts`.

## 4. API Endpoints

### 4.1 Goals CRUD

| Method | Path | Body / Query | Response | Notes |
|--------|------|-------------|----------|-------|
| `GET` | `/api/goals` | `?month=YYYY-MM` (required) | `Goal[]` | All goals for the given month |
| `POST` | `/api/goals` | `{ month, projectId, targetDays }` | `Goal` | Upsert: if `(month, projectId)` exists, update `targetDays`/`targetHours`; otherwise create. |
| `DELETE` | `/api/goals/:id` | — | `{ deleted: true }` | Remove a goal by ID |

### 4.2 Enriched report response

`POST /api/timetracking/report` response gains a new field:

```typescript
interface TtReportResponse {
  // ... existing fields ...
  goals: Goal[];  // goals for the requested month, empty array if none
}
```

The `TimetrackingService` fetches goals for the requested month and includes them in the response. No extra API call from the front-end needed.

### 4.3 Validation (class-validator DTOs)

- `month`: required, matches `^\d{4}-(0[1-9]|1[0-2])$`.
- `projectId`: required, non-empty string.
- `targetDays`: required, positive number, max 31.
- `GET /api/goals` query `month`: required, same regex.

## 5. Front-end: Goal Cards (above table)

When the report loads and `goals` is non-empty, a row of daisyUI cards appears between the stats widget and the grouped table. One card per goal:

- **Title:** project ID
- **Progress bar:** daisyUI `progress` component, colored by status:
  - **Green (`progress-success`):** on pace or ahead
  - **Amber (`progress-warning`):** behind pace but less than 80% of working days elapsed
  - **Red (`progress-error`):** behind pace and more than 80% of working days elapsed
- **Hours text:** `"80 / 132h (60.6%)"`
- **Countdown:** `"6.5 days remaining"` (remaining = `(targetHours - actualHours) / 8`)
- **Pace hint:** `"Book 3.7h/day for the remaining 14 work days"` (see pace calculation below)

If `actualHours >= targetHours`, card shows a green checkmark and `"Goal reached!"` instead of countdown/pace.

Projects without a goal get no card.

## 6. Front-end: Inline Progress in Grouped Table

The grouped table (`project × category`) gains an extra column **"Goal"** (rightmost):

- For projects with a goal: a compact progress bar (daisyUI `progress` in `w-24`) + percentage text.
- For projects without a goal: empty cell or a muted "—".
- The progress bar uses the same color logic as the cards (green/amber/red).
- The first row of each project group also shows a small `badge` with remaining days, e.g. `badge-info` "6.5d left".

## 7. Front-end: Manage Goals (inline section)

Below the month picker + "Run report" row, a collapsible section titled **"Goals"** (collapsed by default, daisyUI `collapse` or a simple toggle):

### 7.1 Goals table

| Project | Target (days) | Target (hours) | Actions |
|---------|--------------|----------------|---------|
| PID000... | 16.5 | 132 | ✏️ 🗑️ |

### 7.2 Add goal form

A single row form below the table:
- **Project ID:** text input (or `<select>` populated from the last report's known `projectId` values, if a report has been run)
- **Target (days):** number input, step 0.5
- **"Add" button**

### 7.3 Interactions

- **Add:** `POST /api/goals` with the selected month, project, and days. On success, re-fetch goals and update the table.
- **Edit:** clicking the edit icon makes the target-days cell editable inline. On blur or Enter, `POST /api/goals` (upsert). On Escape, cancel.
- **Delete:** clicking the trash icon → `DELETE /api/goals/:id`. No confirmation modal (single-user tool, easy to re-add).
- All changes are reflected immediately in the goal cards (if a report is currently displayed).

## 8. Pace Calculation Logic

```
workingDaysInMonth = count of weekdays (Mon–Fri) in the calendar month
workingDaysElapsed = count of weekdays from the 1st to today (inclusive)
                     (if viewing a past month, workingDaysElapsed = workingDaysInMonth)
workingDaysRemaining = workingDaysInMonth - workingDaysElapsed

expectedHoursAtThisPoint = (targetHours / workingDaysInMonth) * workingDaysElapsed
actualHours = sum of hours across all categories for this projectId

status:
  if actualHours >= targetHours       → "reached"
  if actualHours >= expectedHours     → "on_track"
  if workingDaysElapsed / workingDaysInMonth < 0.8 → "behind"
  else                                → "at_risk"

hoursPerDayNeeded = workingDaysRemaining > 0
  ? max(0, (targetHours - actualHours) / workingDaysRemaining)
  : 0  // last working day or past month — no pace hint, show final status only
daysRemaining = max(0, (targetHours - actualHours) / 8)
```

This calculation runs on the front-end (it only needs the goal + actual hours + calendar math). No API involvement beyond supplying the data.

Note: v1 uses weekday counting only. Holidays from the time tracking API (`HOLIDAY` status) are not subtracted. This is acceptable for a first version — the pace hint will be slightly optimistic on months with holidays.

## 9. Component Structure

```
dashboard/web/
  components/
    GoalCards.tsx           — row of goal progress cards
    GoalProgressBar.tsx     — reusable progress bar with color logic
    ManageGoals.tsx         — collapsible goals CRUD section
    TimetrackingTable.tsx   — modified: add "Goal" column
  lib/
    goals.ts               — pace calculation helpers
    api.ts                  — add goals CRUD methods
    types.ts                — add Goal type, update TtReportResponse

dashboard/api/
  src/
    goals/
      goal.entity.ts        — TypeORM entity
      goal.dto.ts           — validation DTOs
      goals.controller.ts   — REST endpoints
      goals.service.ts      — CRUD logic
      goals.module.ts       — NestJS module
    timetracking/
      timetracking.service.ts  — modified: fetch goals and include in response
    app.module.ts              — import GoalsModule
```

## 10. Test Cases

### 10.1 api — Goals CRUD (unit)

- **TC-GOAL-1:** `POST /api/goals` with valid body creates a goal; `targetHours = targetDays * 8`.
- **TC-GOAL-2:** `POST /api/goals` with same `(month, projectId)` upserts (updates `targetDays`/`targetHours`/`updatedAt`).
- **TC-GOAL-3:** `GET /api/goals?month=2026-06` returns only goals for that month.
- **TC-GOAL-4:** `DELETE /api/goals/:id` removes the goal; returns `{ deleted: true }`.
- **TC-GOAL-5:** `DELETE /api/goals/999` (non-existent) returns 404.

### 10.2 api — Goal validation (unit)

- **TC-GVAL-1:** missing `month` → 400.
- **TC-GVAL-2:** invalid `month` (e.g. `2026-13`) → 400.
- **TC-GVAL-3:** missing `projectId` → 400.
- **TC-GVAL-4:** `targetDays` = 0 or negative → 400.
- **TC-GVAL-5:** `targetDays` > 31 → 400.
- **TC-GVAL-6:** `GET /api/goals` without `month` query → 400.

### 10.3 api — Enriched report response (unit)

- **TC-ENRICH-1:** report response includes `goals` array for the requested month.
- **TC-ENRICH-2:** if no goals exist, `goals` is an empty array.
- **TC-ENRICH-3:** when `--months N` is used, goals for each month in the range are included.

### 10.4 web — GoalCards component (Vitest + Testing Library)

- **TC-CARD-1:** renders one card per goal with correct project, hours, percentage.
- **TC-CARD-2:** progress bar is green when on track, amber when behind, red when at risk.
- **TC-CARD-3:** shows "Goal reached!" when actual >= target.
- **TC-CARD-4:** pace hint shows correct hours/day and remaining working days.
- **TC-CARD-5:** no cards rendered when goals array is empty.

### 10.5 web — ManageGoals component (Vitest + Testing Library, MSW)

- **TC-MGMT-1:** renders existing goals in a table.
- **TC-MGMT-2:** adding a goal calls POST and updates the list.
- **TC-MGMT-3:** deleting a goal calls DELETE and removes from list.
- **TC-MGMT-4:** inline edit updates targetDays on blur.
- **TC-MGMT-5:** section is collapsed by default.

### 10.6 web — Inline progress in table (Vitest + Testing Library)

- **TC-INLINE-1:** "Goal" column appears when any goal exists in the response.
- **TC-INLINE-2:** progress bar shown for projects with goals; "—" for projects without.
- **TC-INLINE-3:** first row of project group shows remaining-days badge.

### 10.7 web — Pace calculation helpers (unit)

- **TC-PACE-1:** `workingDaysInMonth('2026-06')` returns 22 (June 2026 has 22 weekdays).
- **TC-PACE-2:** `workingDaysElapsed('2026-06', '2026-06-16')` returns 11 (Mon Jun 1 through Mon Jun 16).
- **TC-PACE-3:** past month → `workingDaysElapsed === workingDaysInMonth`.
- **TC-PACE-4:** `paceStatus` returns `reached` when actual >= target.
- **TC-PACE-5:** `paceStatus` returns `on_track` when actual >= expected pace.
- **TC-PACE-6:** `hoursPerDayNeeded` returns 0 when goal is already reached.

## 11. Out of Scope

- Holiday-aware pace calculation (would need full month data fetch just for goal display).
- Goal templates / recurring goals across months.
- Goal notifications or email alerts.
- Multi-month aggregate goals (e.g., quarterly targets).
- Charts or trend visualizations of goal progress over time.

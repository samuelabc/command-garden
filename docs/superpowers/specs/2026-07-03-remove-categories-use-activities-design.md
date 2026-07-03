# Remove Categories, Use Activities — Design Spec

**Date:** 2026-07-03
**Scope:** UI-only changes to timetracking screens (commandGarden app + dashboard web)

## Problem

The "By project" summary and raw booking lines tables display a "Categories" / "Category" column that provides little actionable value. Activities are more meaningful for goal tracking and daily work context.

## Decision

Remove all `category` references from displayed UI. Replace the "Categories" column in the project summary with "Activities" (resolved activity names). Keep `category` in the data pipeline (CLI, connectors, API types, tests) untouched.

## Changes

### 1. `commandGarden/app/src/client/hooks/useTimetrackingData.ts`

- **`ProjectGroup` interface:** `categories: Set<string>` → `activities: Set<string>`
- **Group-by-project loop (line ~144-154):** Instead of collecting `row.category`, collect resolved activity names using the `activityNames` map (`projectId\0activity` → name). Fall back to raw `row.activity` value if no name found.

### 2. `commandGarden/app/src/client/pages/Timetracking.tsx`

- **Project summary table header (line 119):** `Categories` → `Activities`
- **Project summary table cell (line 133):** `g.categories` → `g.activities`
- **Raw booking lines table (line 146):** Remove `<th>Category</th>` header
- **Raw booking lines table (line 152):** Remove `<td>{String(r.category ?? '')}</td>` cell

### 3. `dashboard/web/components/TimetrackingTable.tsx`

- **Aggregated table header (line 37):** `Category` → `Activity`
- **Aggregated table cells (lines 50-51):** `g.category` → `g.category` (data stays the same — column relabel only, since the dashboard API `TtGroup` still aggregates by category)
- **Raw rows table header (line 86):** Remove `Category` column
- **Raw rows table cells (line 89):** Remove `{r.category}` cell

### 4. Not Changed

- `clis/timetracking/report.js` — CLI still outputs `category` column
- `commandGarden/connectors/timetracking-report.yaml` — connector schema keeps `category`
- `commandGarden/connectors/timetracking-report.eval.js` — eval still maps `mserp_category`
- `commandGarden/connectors/timetracking-projects.yaml` — keeps `category`
- `commandGarden/connectors/timetracking-projects.eval.js` — keeps `category`
- `dashboard/api/src/timetracking/timetracking.service.ts` — `TtRow`, `TtGroup`, aggregation logic unchanged
- `dashboard/api/src/timetracking/timetracking.service.spec.ts` — tests unchanged
- `dashboard/web/lib/types.ts` — type definitions unchanged
- `commandGarden/app/src/client/api.ts` — `ProjectActivity` interface still has `category` field
- `sites/timetracking/field-map.json` — field documentation unchanged

## Risk

Low. UI-only display changes. No data loss, no API contract changes, no test breakage expected.

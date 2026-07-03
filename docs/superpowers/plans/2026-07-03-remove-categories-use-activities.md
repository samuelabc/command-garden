# Remove Categories, Use Activities — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove "Category" from all timetracking UI surfaces and replace with "Activities" (resolved activity names) in project summary tables.

**Architecture:** UI-only changes across 3 files. The hook's `ProjectGroup` type switches from collecting `categories` to collecting resolved `activities`. The two page components drop their Category columns and rename headers. Data pipeline (CLI, connectors, API types, tests) remains untouched.

**Tech Stack:** React, TypeScript, DaisyUI

## Global Constraints

- Data pipeline (CLI columns, connector YAMLs, eval scripts, API service types, tests) must NOT be modified.
- `category` field still exists in raw row data — just not displayed.

---

### Task 1: Update the hook to collect activities instead of categories

**Files:**
- Modify: `commandGarden/app/src/client/hooks/useTimetrackingData.ts:4-8` (interface)
- Modify: `commandGarden/app/src/client/hooks/useTimetrackingData.ts:134-162` (group-by-project useMemo)

**Interfaces:**
- Consumes: `activityNames` map (Map<string, string>, key = `projectId\0activity`, value = human-readable name) — already built at line 113-131 in the same file
- Produces: `ProjectGroup.activities: Set<string>` — used by `Timetracking.tsx` in Task 2

- [ ] **Step 1: Update `ProjectGroup` interface**

Change `categories: Set<string>` to `activities: Set<string>`:

```typescript
interface ProjectGroup {
  projectId: string;
  totalHours: number;
  entryCount: number;
  activities: Set<string>;
}
```

- [ ] **Step 2: Update group-by-project useMemo to collect activities**

In the `useMemo` that builds `projectList`, add `activityNames` as a dependency and collect resolved activity names instead of categories:

```typescript
const { projectList, totalHours, draftCount, workingDayCount } = useMemo(() => {
    const groups = new Map<string, ProjectGroup>();
    let total = 0;
    let drafts = 0;
    const days = new Set<string>();
    for (const row of rows) {
      const pid = String(row.projectId ?? 'Unknown');
      const hours = Number(row.hours ?? 0);
      const date = String(row.date ?? '');
      const status = String(row.status ?? '');
      const act = String(row.activity ?? '');
      total += hours;
      if (date) days.add(date);
      if (status === 'draft') drafts++;
      if (!groups.has(pid)) {
        groups.set(pid, { projectId: pid, totalHours: 0, entryCount: 0, activities: new Set() });
      }
      const g = groups.get(pid)!;
      g.totalHours += hours;
      g.entryCount++;
      if (act) {
        const name = activityNames.get(`${pid}\0${act}`) ?? act;
        g.activities.add(name);
      }
    }
    return {
      projectList: Array.from(groups.values()).sort((a, b) => b.totalHours - a.totalHours),
      totalHours: total,
      draftCount: drafts,
      workingDayCount: days.size,
    };
  }, [rows, activityNames]);
```

Key differences from the old code:
- Reads `row.activity` instead of `row.category`
- Resolves activity name via `activityNames.get(pid + '\0' + act)`, falls back to raw activity number
- Adds `activityNames` to the useMemo dependency array

- [ ] **Step 3: Verify the app compiles**

Run: `cd commandGarden && npm run build` (or check the dev server for TypeScript errors)
Expected: No type errors. `Timetracking.tsx` will show a type error on `g.categories` — that's expected and fixed in Task 2.

- [ ] **Step 4: Commit**

```bash
git add commandGarden/app/src/client/hooks/useTimetrackingData.ts
git commit -m "refactor(timetracking): collect activities instead of categories in ProjectGroup"
```

---

### Task 2: Update commandGarden Timetracking page

**Files:**
- Modify: `commandGarden/app/src/client/pages/Timetracking.tsx:119` (project table header)
- Modify: `commandGarden/app/src/client/pages/Timetracking.tsx:133` (project table cell)
- Modify: `commandGarden/app/src/client/pages/Timetracking.tsx:146` (raw table header)
- Modify: `commandGarden/app/src/client/pages/Timetracking.tsx:152` (raw table cell)

**Interfaces:**
- Consumes: `ProjectGroup.activities: Set<string>` from Task 1

- [ ] **Step 1: Update project summary table**

Change the header from `Categories` to `Activities` and update the cell reference:

Header (line 119):
```tsx
<thead><tr><th>Project</th><th>Activities</th><th className="text-right">Hours</th><th className="text-right">Entries</th></tr></thead>
```

Cell (line 133):
```tsx
<td className="text-sm">{Array.from(g.activities).join(', ')}</td>
```

- [ ] **Step 2: Remove Category from raw booking lines table**

Remove `<th>Category</th>` from the header (line 146):
```tsx
<thead><tr><th>Date</th><th>Project</th><th>Activity</th><th className="text-right">Hours</th><th>Status</th></tr></thead>
```

Remove the category `<td>` from the row (line 152):
```tsx
{rows.map((r, i) => (
  <tr key={i}>
    <td>{String(r.date ?? '')}</td>
    <td className="font-mono text-xs">{String(r.projectId ?? '')}</td>
    <td>{String(r.activity ?? '')}</td>
    <td className="text-right">{Number(r.hours ?? 0).toFixed(1)}</td>
    <td>
      <Badge variant={String(r.status) === 'posted' ? 'success' : 'warning'} size="xs">
        {String(r.status ?? '')}
      </Badge>
    </td>
  </tr>
))}
```

- [ ] **Step 3: Verify app compiles and renders**

Run the dev server and check:
1. "By project" table shows "Activities" header with resolved activity names
2. Raw booking lines table has no "Category" column
3. No console errors

- [ ] **Step 4: Commit**

```bash
git add commandGarden/app/src/client/pages/Timetracking.tsx
git commit -m "feat(timetracking): replace categories with activities in commandGarden UI"
```

---

### Task 3: Update dashboard TimetrackingTable

**Files:**
- Modify: `dashboard/web/components/TimetrackingTable.tsx:37` (aggregated table header)
- Modify: `dashboard/web/components/TimetrackingTable.tsx:50-51` (aggregated table cells)
- Modify: `dashboard/web/components/TimetrackingTable.tsx:86` (raw table header)
- Modify: `dashboard/web/components/TimetrackingTable.tsx:89` (raw table row)

**Interfaces:**
- Consumes: `TtGroup.category` (unchanged type — we just relabel the column header)
- Consumes: `TtRow` (unchanged — we remove the category cell from display)

- [ ] **Step 1: Relabel aggregated table header and update key**

Header (line 37):
```tsx
<th>Project</th><th>Activity</th><th className="text-right">Hours</th><th className="text-right">Lines</th>
```

The row key uses `g.category` — keep it since the data hasn't changed, just relabeled (line 50):
```tsx
<tr key={`${g.projectId}-${g.category}`}>
  <td>{g.projectId}</td><td>{g.category}</td>
```

No cell change needed — the underlying data field is still `category` in the API response, we're just showing it under the "Activity" header.

- [ ] **Step 2: Remove Category from raw rows table**

Header (line 86):
```tsx
<thead><tr><th>Date</th><th>Project</th><th>Activity</th><th className="text-right">Hours</th></tr></thead>
```

Row (line 89):
```tsx
<tr key={i}><td>{r.date}</td><td>{r.projectId}</td><td>{r.activity}</td><td className="text-right">{r.hours ?? 0}</td></tr>
```

- [ ] **Step 3: Verify dashboard compiles**

Run: `cd dashboard/web && npm run build` (or check dev server)
Expected: No type errors, no rendering issues.

- [ ] **Step 4: Commit**

```bash
git add dashboard/web/components/TimetrackingTable.tsx
git commit -m "feat(timetracking): replace categories with activities in dashboard UI"
```

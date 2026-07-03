# Timetracking Report Cache

Cache the full timetracking report in the app server's SQLite database so that goal progress, project tables, and stats display immediately when the user navigates to the Timetracking page — before triggering a fresh browser-based fetch.

## Problem

Fetching the timetracking report requires driving a real browser session (MSAL auth, ReportFAK API). This takes several seconds. Until the user clicks "Load report", the page shows goals with 0/Xh progress because there's no report data to compute actual hours from.

## Solution

After each successful report fetch, persist the full report response (all raw rows) server-side. On page load, serve the cached data instantly so the UI populates immediately. A fresh fetch overwrites the cache.

## Data Model

New `report_cache` table in `AppStore` (SQLite via sql.js):

```sql
CREATE TABLE IF NOT EXISTS report_cache (
  month      TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
```

- **month** — `YYYY-MM` key, one cached report per month
- **data** — JSON-stringified array of raw report rows (same shape as connector output)
- **fetched_at** — ISO timestamp of when the report was fetched

## AppStore Methods

- `cacheReport(month: string, data: Record<string, unknown>[]): void` — upsert the cache for a month
- `getCachedReport(month: string): { data: Record<string, unknown>[]; fetchedAt: string } | null` — return cached data or null

## API Endpoints

### `GET /api/timetracking/cache?month=YYYY-MM`

Returns cached report data for the given month.

Response when cache exists:
```json
{ "ok": true, "data": [...rows], "fetchedAt": "2026-07-03T04:30:00.000Z" }
```

Response when no cache:
```json
{ "ok": true, "data": null, "fetchedAt": null }
```

### `POST /api/timetracking/cache`

Stores report data in the cache.

Body:
```json
{ "month": "2026-07", "data": [...rows] }
```

Response:
```json
{ "ok": true }
```

## Client Changes

### `api.ts`

Add two methods:
- `getCachedReport(month: string)` — GET
- `cacheReport(month: string, data: Record<string, unknown>[])` — POST

### `Timetracking.tsx`

**On mount + month change** (in the existing `useEffect`):
1. Fetch goals (existing)
2. Fetch cached report via `api.getCachedReport(month)`
3. If cache exists, set a new `cachedResult` state that populates the same data path as a fresh fetch
4. Display a "cached" indicator: `"Data from X ago"` in `font-mono text-[0.6rem] opacity-40`

**After successful "Load report":**
1. Display fresh data (existing)
2. Fire-and-forget `api.cacheReport(month, result.data)` to persist the fresh data
3. Clear the "cached" indicator

**Cached vs. fresh indicator:**
- When displaying cached data: show `"Last fetched: Xm ago"` next to the stats grid
- When displaying fresh data: no indicator (or brief "Updated just now" that fades)

## File Changes

| File | Action |
|------|--------|
| `app/src/server/store.ts` | Add `report_cache` table + `cacheReport`/`getCachedReport` methods |
| `app/src/server/routes/timetracking-cache.ts` | New: GET + POST cache routes |
| `app/src/server/routes/index.ts` | Register cache routes |
| `app/src/client/api.ts` | Add `getCachedReport` + `cacheReport` methods |
| `app/src/client/pages/Timetracking.tsx` | Load cache on mount, save after fetch, show staleness indicator |

## Edge Cases

- **Month changes**: cache is per-month, so switching months loads that month's cache (or shows empty if never fetched)
- **No cache exists**: page behaves exactly as today — goals show 0h until report is fetched
- **Stale data**: cached data may be hours or days old. The staleness indicator makes this clear. User clicks "Load report" to refresh.
- **Cache size**: a typical month has ~200 booking lines. JSON-stringified, this is ~20-40KB per month. Negligible for SQLite.

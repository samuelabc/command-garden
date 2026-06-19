# timetracking.mercedes-benz-techinnovation.com — site notes

## 2026-06-15 by Cascade

- Built adapter `timetracking/report` (one row per booking line). Strategy: COOKIE (reuse authenticated browser session) + page-context `fetch`.
- App is an **Azure AD / MSAL SPA** (MUI/React). MSAL caches tokens in **sessionStorage** (keys prefixed `msal.3|...`). The access token JSON lives under the key containing `accesstoken`; use its `.secret` (JWT) as `Authorization: Bearer`. Check `.expiresOn` (unix seconds) — tokens last ~85 min.
- The report data API (`ReportFAK`) is on a **separate Azure Front Door origin** (`*.azurefd.net`), not the app origin. A bare page `fetch` does NOT auto-attach the token, so we read it from sessionStorage and set the header manually. CORS allows the timetracking origin.
- `date` param is the **first of the month** (`YYYY-MM-01`) and returns the whole month (one object per day).
- Booking date for a line = its parent day's `calendarHeader.date` (NOT `mserp_projectdate`, which can differ). Daily hours sum to the workday (e.g. 8h) — good sanity check.
- Adapter CLI: `--month YYYY-MM` (single, default current month) or `--months N` (last N months, **hard-capped at 6** to avoid hammering the server — one request per month).
- Auth gotcha: if the bound tab has no valid token (expired / fresh tab without MSAL hydration), the adapter polls sessionStorage up to 8s then throws `AuthRequiredError`. Fix = open the app and log in, then retry.
- Verify fixture pinned to **2026-05** (fully RELEASED past month = 30 rows, stable). Don't pin to the current month (still being booked → row count drifts).

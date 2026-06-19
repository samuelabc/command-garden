# teams / outlook calendar — site notes

## 2026-06-15 by Cascade

- Adapter `teams/roomfreebusy`: free/busy timeline for **one** meeting room on a day. Strategy: **COOKIE + UI drive + intercept** (Watch).
- **Teams Calendar is Outlook on the web (OWA)** embedded in an iframe (`outlook.office.com/hosted/calendar/`). The standalone OWA calendar (`outlook.office.com.mcas.ms`) is the same backend and easier to drive (top-level page). The adapter targets OWA directly.
- **MCAS proxy**: this tenant routes everything through Microsoft Defender for Cloud Apps. Hosts are rewritten to `*.mcas.ms` and requests carry `McasCtx` / `McasTsid` / `McasUserAuth` query params injected by the proxy. Requests MUST originate from the browser page so the proxy injects auth.
- **Free/busy source**: OWA GraphQL gateway `POST /outlookgatewayb2/graphql`, operation `GetSchedule`. Response is the Graph `getSchedule` contract (see `endpoints.json`).
- **Why not replay (verify-then-pick resolved to Watch)**: a page-context `fetch` to the gateway (and to SchedulingB2) returns **401**. OWA adds a per-request `X-OWA-CANARY` header whose cookie is **httpOnly** (not JS-readable), plus a bearer; the MSAL token cache is **encrypted** (`msal.cache.encryption` cookie). Even calling `window.fetch` ourselves does NOT get the canary auto-injected (tested → 401). So we let the page issue the request and intercept the response (custom fetch hook → `window.__rfb`).
- **Timeline is built from `scheduleItems`, NOT `availabilityView`.** Reason: each captured response's `availabilityView` window is in **UTC** (slot 0 = 00:00 UTC), so decoding it as local mislabels times by the TZ offset. `scheduleItems` carry absolute **UTC** datetimes; we convert them to local in the **browser** (`page.evaluate`, so the user's calendar TZ applies), clip to the requested local day, merge overlaps, and fill free gaps. `availabilityView` semantics for reference: `0=free 1=tentative 2=busy 3=oof 4=workingElsewhere`.
  - **Caveat**: if a room restricts calendar details, getSchedule returns only `availabilityView` (busy mask) with empty `scheduleItems` → the timeline would show **free**. The MBTMY rooms tested DO expose `scheduleItems`, so this is not hit here. (Future: decode `availabilityView` using the captured request's `startTime`/`timeZone` for the absolute window.)
- **Adding the room (two paths)**:
  - **Name** (e.g. `MBTMY The Vista`) → Scheduling Assistant **"Add a room"** finder (`findmeetinglocations`); room suggestions carry `Capacity` in their `[role=option]` aria-label. The finder does **NOT** resolve a raw SMTP address.
  - **Email** (contains `@`) → **"Add required attendee"** picker, whose resolved `[role=option]` aria-label contains the SMTP. (Expand the **Required attendees** section first if collapsed.)
- **Identifying the room vs the organizer**: getSchedule fires once per attendee. Capture the organizer's own mailbox id(s) BEFORE adding the room; the room is the mailbox id NOT seen before (or the exact email when an email was passed).
- **UI gotchas**:
  - `Add a room` / `Add required attendee` controls have an **empty `aria-label`** — match by **text** (`clickByName` checks aria-label OR textContent).
  - **Required attendees** section may be collapsed; toggle aria-label is `Expand/Collapse Required attendees` (capital R) — distinct from the `Add required attendee` button.
  - Date picker cell aria-label = `"<D, Month, YYYY>"` (no leading zero), e.g. `18, June, 2026`. Month nav: `Go to next month <Month>` / `Go to previous month <Month>`.
  - The compose `Add a room or location` (location field) treats a raw email as plain text — do not use it; use the SA Rooms/attendee fields.
  - The Scheduling Assistant must be opened (`Open Scheduling Assistant`) before `Start date` / room fields exist. Set the date **before** adding the room (per-mailbox free/busy is cached within a page session; a fresh `page.goto(compose)` runs each invocation).
- **Sample rooms** (Puchong, Wisma Mercedes-Benz L4): `RES-RERE-M6VJ7ZUW@mercedes-benz.com` (The Vista), `RES-RERE-M6VZDEMW@mercedes-benz.com` (The Summit).
- **Auth**: if `goto(compose)` redirects to login or the compose controls never appear => `AuthRequiredError`. Open Teams/Outlook and sign in, then retry.
- **Verify fixture** pins `RES-RERE-M6VJ7ZUW@…` (Vista) on **2026-06-12** (a frozen past day = stable). Use an **email** in the fixture: the verify harness splits args on spaces, so a multi-word room name breaks `--room`.
- **Portability**: hosts are hardcoded to `*.mcas.ms` for this tenant. A non-MCAS tenant would use `outlook.office.com`.

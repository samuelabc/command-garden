# opencli adapter: `timetracking/report`

Fetches the **MBTI Time Tracking** monthly report (one row per booking line) from
`https://timetracking.mercedes-benz-techinnovation.com/`.

## Layout

```
clis/timetracking/report.js              # the adapter (canonical source)
sites/timetracking/endpoints.json        # ReportFAK API memory
sites/timetracking/field-map.json        # field code dictionary
sites/timetracking/notes.md              # session notes / gotchas
sites/timetracking/verify/report.json    # verify fixture (pinned to 2026-05)
```

These mirror `~/.opencli/clis/` and `~/.opencli/sites/`, where opencli loads them
at runtime. After editing, sync with:

```powershell
Copy-Item .\clis\timetracking\report.js   "$env:USERPROFILE\.opencli\clis\timetracking\report.js" -Force
Copy-Item .\sites\timetracking\* "$env:USERPROFILE\.opencli\sites\timetracking\" -Recurse -Force
```

## Usage

```bash
opencli timetracking report                       # current month
opencli timetracking report --month 2026-05       # a specific month (YYYY-MM)
opencli timetracking report --months 3            # last N months (1-6), one request per month
opencli timetracking report --month 2026-05 --format json
```

## How it works

- The app is an **Azure AD / MSAL SPA**. The report API (`ReportFAK`) lives on a
  separate Azure Front Door origin and needs the MSAL **access token** as a
  `Bearer` header.
- Strategy `COOKIE`: opencli navigates to the app (reusing your logged-in Chrome
  session), then the adapter reads the cached token from `sessionStorage` and
  `fetch`es the report from page context.
- You must be **logged in** to the app in the connected browser. If the token is
  missing/expired the adapter throws `AUTH_REQUIRED` — open the app, log in, retry.

## Verify

```bash
opencli browser verify timetracking/report --strict-memory
```

Fixture is pinned to **2026-05** (a fully `RELEASED` past month = 30 rows, stable).

---

# opencli adapter: `teams/roomfreebusy`

Returns the **free/busy timeline for one meeting room** on a given day from the Microsoft
Teams / Outlook calendar at `https://outlook.office.com.mcas.ms/` (the Teams calendar is
Outlook on the web; this tenant is behind the Defender for Cloud Apps `*.mcas.ms` proxy).

## Layout

```
clis/teams/roomfreebusy.js               # the adapter (canonical source)
sites/teams/endpoints.json               # GetSchedule + findmeetinglocations memory
sites/teams/notes.md                     # session notes / gotchas
sites/teams/verify/roomfreebusy.json     # verify fixture (pinned to 2026-06-12, Vista)
```

## Usage

```bash
opencli teams roomfreebusy --room "MBTMY The Vista"                 # today, by room name
opencli teams roomfreebusy --room "MBTMY The Summit" --date 2026-06-18
opencli teams roomfreebusy --room RES-RERE-M6VJ7ZUW@mercedes-benz.com --date 2026-06-18 --format json
```

- `--room` — room **name** (resolved via the Scheduling Assistant room finder) **or** mailbox
  **email** (resolved via the attendee picker). Names with spaces must be quoted.
- `--date` — `YYYY-MM-DD`, defaults to today. Times are returned in your calendar's local timezone.

Output is one row per timeline block: `room` (resolved mailbox), `date`, `state`
(`free`/`busy`/`tentative`/`oof`/`elsewhere`), `start`, `end` (`24:00` = end of day), `durationMin`.

## How it works

- **Strategy `COOKIE` + UI drive + intercept (Watch).** A direct/replayed `fetch` to the
  free/busy endpoint **401s** (OWA injects a per-request `X-OWA-CANARY` from an httpOnly cookie
  plus a bearer; the MSAL token cache is encrypted). So the adapter reuses your logged-in
  session: it opens the calendar compose **Scheduling Assistant**, sets the date, adds the room,
  and **intercepts** the page's own `getSchedule` GraphQL response.
- The timeline is built from `scheduleItems` (absolute UTC datetimes, converted to your local
  timezone in the browser), merged into busy blocks with free gaps for the day.
- You must be **logged in** to Teams/Outlook in the connected browser. If not, the adapter
  throws `AUTH_REQUIRED` — open the calendar, sign in, and retry.

## Verify

```bash
opencli browser verify teams/roomfreebusy
```

Fixture pinned to **2026-06-12** for `RES-RERE-M6VJ7ZUW@mercedes-benz.com` (a frozen past day;
uses the email since the verify harness splits args on spaces).

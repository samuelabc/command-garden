# personal Dashboard

Local single-user dashboard for the `opencli` adapters in this repo.

## Prerequisites
- `opencli` installed and on PATH (verify: `opencli --version`).
- Be signed in to the target apps in your Chrome session (opencli reuses it).

## Run (two terminals)

```powershell
# Terminal 1 — API (http://localhost:3001)
cd dashboard/api; npm install; npm run start:dev

# Terminal 2 — Web (http://localhost:3000)
cd dashboard/web; npm install; npm run dev
```

Open http://localhost:3000.

## Test

```powershell
cd dashboard/api; npm test; npm run test:e2e
cd dashboard/web; npm test
```

## Notes
- Audit log persists to `dashboard/api/data/audit.sqlite`.
- Commands can take 10–60s because opencli drives a real browser; the UI shows a spinner.
- If you see "Sign-in required", open Chrome, log in, and retry.

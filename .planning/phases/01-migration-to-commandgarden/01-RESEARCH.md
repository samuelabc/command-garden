# Phase 1: Migration to commandGarden — Research

**Researched:** 2026-07-05
**Status:** Complete

## Source Codebase Analysis (dashboard/)

### Backend (NestJS)

The journal backend lives in `dashboard/api/src/journal/` and uses NestJS DI patterns:

| File | Purpose | NestJS Dependencies |
|------|---------|-------------------|
| `journal.controller.ts` | `@Controller('journal')` with `@Post('generate')` | `@Body`, `@Controller`, `@Post` |
| `journal.service.ts` | Orchestrates 4 sources via `Promise.allSettled`, cross-references, basic insights | `@Injectable` |
| `journal.module.ts` | Wires all providers + `AuditModule` import | `@Module` |
| `journal.dto.ts` | Request validation with `class-validator` | `@IsString`, `@Matches` |
| `journal.types.ts` | All TypeScript interfaces (JournalResponse, source data shapes) | None (pure types) |
| `journal.config.ts` | Env-var config: `JOURNAL_AUTHOR`, `ADO_ORG`, `ADO_PAT`, `ADO_REPOS` | None (pure config) |

### Source Files

| Source | API Used | Auth Method | NestJS DI |
|--------|----------|-------------|-----------|
| `git.source.ts` | ADO Pushes API + PRs API (direct REST) | PAT via env var | `@Injectable`, injects nothing |
| `jira.source.ts` | ADO Work Items WIQL API (direct REST) | PAT via env var | `@Injectable`, injects nothing |
| `timetracking.source.ts` | OpencliService → spawns `opencli` CLI | Browser session | `@Injectable`, injects `OpencliService` |
| `meetings.source.ts` | OpencliService → spawns `opencli` CLI | Browser session | `@Injectable`, injects `OpencliService` |

**Key insight:** Git and Jira sources use direct REST APIs and only depend on config. They can be ported as plain functions/classes with zero framework dependencies. Timetracking and Meetings use `OpencliService` which spawns `opencli` CLI — this must be replaced with `DaemonClient.post('/api/run', ...)` calls.

### `OpencliService` (replacement target)

`dashboard/api/src/opencli/opencli.service.ts` spawns `opencli` as a child process with `--format json`, parses stdout, handles errors. Interface:
```typescript
run<T>(args: string[], opts?: { timeoutMs?: number }): Promise<OpencliResult<T>>
// Returns: { status, data: T[], rowCount, exitCode, errorMessage }
```

**Replacement in commandGarden:** `DaemonClient.post('/api/run', { connector: 'site/name', args: {...} })` — same data, different transport (HTTP to daemon instead of CLI spawn).

### Frontend (Next.js)

| File | Purpose | Next.js-Specific |
|------|---------|-------------------|
| `app/journal/page.tsx` | Week picker + generate button + state mgmt | `'use client'` directive |
| `components/journal/SummaryCards.tsx` | 4 stat cards (hours, meetings, tickets, commits) | `'use client'`, `@/lib/types` import |
| `components/journal/DailyBreakdown.tsx` | Per-day table (hours, meetings, commits, tickets) | `'use client'`, `@/lib/types` import |
| `components/journal/InsightsPanel.tsx` | Insights list + error warnings | `'use client'` |
| `lib/api.ts` | `api.generateJournal()` → `POST /journal/generate` | Next.js API base path |
| `lib/types.ts` | Frontend type duplicates of backend types | None |

**Key insight:** All frontend components use **DaisyUI classes** (stat, table, alert, btn) — commandGarden/app also uses DaisyUI + Tailwind, so CSS classes port as-is. Only need to remove `'use client'` directives and fix import paths.

## Target Codebase Analysis (commandGarden/app/)

### Server Architecture

```
commandGarden/app/src/server/main.ts
  → Fastify instance on port 9092
  → DaemonClient from @commandgarden/shared (HTTP client to daemon:9091)
  → AppStore (sql.js SQLite)
  → registerRoutes(app, daemon, store) — pattern for all route files
```

**Route registration pattern** (every route file follows this):
```typescript
export function xyzRoutes(app: FastifyInstance, daemon: DaemonClient, store?: AppStore): void {
  app.post('/api/xyz', async (req, reply) => { ... });
}
```

**Existing routes:** status, connectors, run, audit, config, preferences, goals, timetracking-cache.

### Client Architecture

```
commandGarden/app/src/client/
  main.tsx → renders App
  App.tsx → BrowserRouter + Routes + Layout (sidebar + Outlet)
  api.ts → fetch wrapper with typed methods
  pages/ → Dashboard, Connectors, ConnectorRun, Audit, Config, Guide, Timetracking, Rooms
```

**Sidebar structure:** Overview > Dashboard | Apps > Time Tracking, Room Availability | Platform > Connectors, Audit Log, Configuration | Help > Setup Guide

**Vite proxy:** `/api` → `http://127.0.0.1:9092` (dev mode)

### DaemonClient API

```typescript
// @commandgarden/shared/src/daemon-client.ts
class DaemonClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
  status(): Promise<{ok, extensionConnected, connectorCount}>
  pipeRaw(path: string): Promise<Response>  // SSE
  connectSSE(path, onEvent, signal?): Promise<void>
}
```

The daemon's `/api/run` endpoint accepts: `{ connector: 'site/name', args: { key: value } }` and returns connector results.

## Migration Strategy

### Backend Migration (Plan 1.1)

1. **Types** — Copy `journal.types.ts` as-is (no NestJS deps). Place in `src/server/journal/journal.types.ts`.

2. **Config** — Copy `journal.config.ts` as-is (pure env vars). Place in `src/server/journal/journal.config.ts`.

3. **Sources** — Strip `@Injectable` decorator:
   - `git.source.ts` → plain class, constructor takes config (no DI). Works immediately via REST API.
   - `jira.source.ts` → plain class, constructor takes config. Works immediately via REST API.
   - `timetracking.source.ts` → replace `OpencliService` with `DaemonClient`. Change `this.opencli.run(['timetracking', 'report', '--month', month])` to `daemon.post('/api/run', { connector: 'timetracking/report', args: { month } })`. **Won't work until Phase 2 connector is built — returns null gracefully.**
   - `meetings.source.ts` → same pattern. **Won't work until Phase 2 connector is built — returns null gracefully.**

4. **Service** — Strip `@Injectable`, take sources as constructor params instead of DI. Business logic (parallel fetch, cross-reference, insights) ports 1:1.

5. **Route** — New `journal.ts` route file following existing pattern:
   ```typescript
   export function journalRoutes(app: FastifyInstance, daemon: DaemonClient): void {
     app.post('/api/journal/generate', async (req, reply) => { ... });
   }
   ```
   Register in `routes/index.ts`.

6. **Audit** — Dashboard uses TypeORM `AuditService`. commandGarden already has an audit route (`/api/audit`) that proxies to daemon. For Phase 1, journal logs audit via `daemon.post('/api/audit/log', ...)` or the existing app audit infrastructure.

### Frontend Migration (Plan 1.2)

1. **Types** — Create `src/client/types/journal.ts` with frontend type interfaces (copy from `dashboard/web/lib/types.ts` journal section).

2. **API** — Add `generateJournal` method to `src/client/api.ts`.

3. **Components** — Port to `src/client/components/journal/`:
   - Remove `'use client'` directives
   - Change `import type { JournalResponse } from '@/lib/types'` → relative import
   - CSS classes (DaisyUI) remain identical

4. **Page** — Create `src/client/pages/Journal.tsx`:
   - Port from `dashboard/web/app/journal/page.tsx`
   - Remove `'use client'`
   - Use commandGarden's `api.ts` helper
   - Week picker logic ports as-is

5. **Router** — Add route in `App.tsx`:
   ```tsx
   <Route path="apps/journal" element={<Journal />} />
   ```

6. **Sidebar** — Add NavLink under "Apps":
   ```tsx
   <NavLink to="/apps/journal" className={navClass}>Dev Journal</NavLink>
   ```

## Risks & Dependencies

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `.env` not accessible from commandGarden/app | Git/Jira sources can't auth | Check env var loading in Vite vs Fastify; may need dotenv |
| DaemonClient run format mismatch | Sources that need daemon can't parse response | Verify daemon /api/run response shape matches OpencliResult |
| AppStore schema differs from AuditLog entity | Audit calls fail | Use daemon audit proxy or add journal audit table to AppStore |
| Buffer.from for PAT auth (Node.js only) | Fails in browser context | Confirmed: sources run on server (Fastify), not client — Buffer is available |

## Validation Architecture

### Baseline Test Plan

1. `cg up` starts daemon + app server + GUI
2. Navigate to journal page in browser → UI renders with week picker
3. `POST /api/journal/generate` → returns response (Git source via ADO REST API works; other sources return null gracefully)
4. Summary cards render with Git data; meetings/timetracking/jira show "—"
5. No console errors

## RESEARCH COMPLETE

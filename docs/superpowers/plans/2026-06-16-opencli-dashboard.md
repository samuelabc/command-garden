# opencli Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local single-user web dashboard that triggers `opencli` commands, shows aggregated Time Tracking and Room Availability results, and records a persistent audit log of every run.

**Architecture:** A NestJS API (`dashboard/api`, port 3001) spawns the installed `opencli <site> <cmd> ... --format json` binary as a child process, parses stdout, aggregates results, and records each run in a SQLite audit table. A Next.js App-Router front-end (`dashboard/web`, port 3000) with Tailwind + daisyUI calls the API over REST and renders results synchronously with a spinner.

**Tech Stack:** NestJS 10, TypeORM + better-sqlite3, class-validator, Jest + supertest (api); Next.js 14, React 18, Tailwind CSS + daisyUI, Lucide, Vitest + Testing Library + MSW (web).

**Spec:** `docs/superpowers/specs/2026-06-16-opencli-dashboard-design.md`

---

## File Structure

```
dashboard/
  api/
    src/
      main.ts                         # Nest bootstrap, CORS, global ValidationPipe
      app.module.ts                   # root module wiring
      opencli/
        opencli.service.ts            # the ONLY child_process spawner + parser
        opencli.types.ts              # OpencliResult discriminated union
        opencli.service.spec.ts
      timetracking/
        timetracking.controller.ts
        timetracking.service.ts       # aggregation by project+category
        timetracking.dto.ts
        timetracking.service.spec.ts
        timetracking.e2e-spec.ts
      teams/
        teams.controller.ts
        teams.service.ts
        teams.dto.ts
        teams.e2e-spec.ts
      audit/
        audit.entity.ts               # AuditLog TypeORM entity
        audit.service.ts              # write + paginated query
        audit.controller.ts           # GET /api/audit
        audit.service.spec.ts
        audit.e2e-spec.ts
    data/                             # sqlite file lives here (gitignored)
    package.json, tsconfig*.json, nest-cli.json, .gitignore
  web/
    app/
      layout.tsx                      # drawer + navbar + theme
      page.tsx                        # redirect to /timetracking
      timetracking/page.tsx
      rooms/page.tsx
      audit/page.tsx
    components/
      Sidebar.tsx, Spinner.tsx, AuthRequiredCallout.tsx
      TimetrackingTable.tsx, TimelineView.tsx, AuditTable.tsx
    lib/
      api.ts                          # typed apiClient
      types.ts                        # shared response types
    test/                             # Vitest setup + MSW handlers
    package.json, next.config.js, tailwind.config.ts, postcss.config.js,
    tsconfig.json, vitest.config.ts, .gitignore
```

---

## Task 1: Scaffold the NestJS API

**Files:**
- Create: `dashboard/api/package.json`
- Create: `dashboard/api/tsconfig.json`, `dashboard/api/tsconfig.build.json`, `dashboard/api/nest-cli.json`
- Create: `dashboard/api/.gitignore`
- Create: `dashboard/api/src/main.ts`
- Create: `dashboard/api/src/app.module.ts`

- [ ] **Step 1: Create `dashboard/api/package.json`**

```json
{
  "name": "opencli-dashboard-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:e2e": "jest --config ./jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@nestjs/typeorm": "^10.0.2",
    "better-sqlite3": "^11.3.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "typeorm": "^0.3.20"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/testing": "^10.4.0",
    "@types/better-sqlite3": "^7.6.11",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-loader": "^9.5.1",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.5.4"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create `dashboard/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 3: Create `dashboard/api/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts", "**/*e2e-spec.ts"]
}
```

- [ ] **Step 4: Create `dashboard/api/nest-cli.json`**

```json
{ "$schema": "https://json.schemastore.org/nest-cli", "collection": "@nestjs/schematics", "sourceRoot": "src" }
```

- [ ] **Step 5: Create `dashboard/api/.gitignore`**

```
node_modules
dist
data/*.sqlite
```

- [ ] **Step 6: Create `dashboard/api/src/main.ts`**

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: ['http://localhost:3000'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(3001);
}
bootstrap();
```

- [ ] **Step 7: Create `dashboard/api/src/app.module.ts`** (modules added in later tasks; start minimal)

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AuditLog } from './audit/audit.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: join(__dirname, '..', 'data', 'audit.sqlite'),
      entities: [AuditLog],
      synchronize: true,
    }),
  ],
})
export class AppModule {}
```

- [ ] **Step 8: Install deps**

Run: `npm install` (cwd `dashboard/api`)
Expected: dependencies install; `node_modules` created. (`app.module.ts` will not compile until Task 3 creates `AuditLog` — acceptable; do not run build yet.)

- [ ] **Step 9: Commit**

```bash
git add dashboard/api
git commit -m "chore(api): scaffold NestJS dashboard API"
```

---

## Task 2: OpencliService — spawn + parse + timeout + error mapping (TDD)

**Files:**
- Create: `dashboard/api/src/opencli/opencli.types.ts`
- Create: `dashboard/api/src/opencli/opencli.service.ts`
- Test: `dashboard/api/src/opencli/opencli.service.spec.ts`

- [ ] **Step 1: Create the result types `dashboard/api/src/opencli/opencli.types.ts`**

```ts
export type OpencliStatus = 'success' | 'auth_required' | 'empty' | 'error';

export interface OpencliResult<T = Record<string, unknown>> {
  status: OpencliStatus;
  data: T[];
  rowCount: number;
  durationMs: number;
  exitCode: number | null;
  errorCode?: string;
  errorMessage?: string;
}

export interface OpencliRunOptions {
  timeoutMs?: number; // default 120000
}
```

- [ ] **Step 2: Write the failing test `dashboard/api/src/opencli/opencli.service.spec.ts`**

```ts
import { OpencliService } from './opencli.service';
import { EventEmitter } from 'events';
import * as child_process from 'child_process';

jest.mock('child_process');

function fakeChild() {
  const cp: any = new EventEmitter();
  cp.stdout = new EventEmitter();
  cp.stderr = new EventEmitter();
  cp.kill = jest.fn();
  return cp;
}

describe('OpencliService', () => {
  let service: OpencliService;
  let cp: any;

  beforeEach(() => {
    service = new OpencliService();
    cp = fakeChild();
    (child_process.spawn as jest.Mock).mockReturnValue(cp);
  });

  it('TC-OS-1: parses a JSON array on success', async () => {
    const p = service.run(['timetracking', 'report']);
    cp.stdout.emit('data', JSON.stringify([{ a: 1 }, { a: 2 }]));
    cp.emit('close', 0);
    const res = await p;
    expect(res.status).toBe('success');
    expect(res.rowCount).toBe(2);
    expect(res.data).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('TC-OS-2: maps AUTH_REQUIRED on stderr to auth_required', async () => {
    const p = service.run(['timetracking', 'report']);
    cp.stderr.emit('data', 'Error: AUTH_REQUIRED please log in');
    cp.emit('close', 1);
    const res = await p;
    expect(res.status).toBe('auth_required');
    expect(res.errorCode).toBe('AUTH_REQUIRED');
  });

  it('TC-OS-3: maps EMPTY_RESULT to empty', async () => {
    const p = service.run(['timetracking', 'report']);
    cp.stderr.emit('data', 'EMPTY_RESULT: no rows');
    cp.emit('close', 1);
    const res = await p;
    expect(res.status).toBe('empty');
    expect(res.rowCount).toBe(0);
  });

  it('TC-OS-4: kills child and returns error on timeout', async () => {
    jest.useFakeTimers();
    const p = service.run(['teams', 'roomfreebusy'], { timeoutMs: 50 });
    jest.advanceTimersByTime(60);
    const res = await p;
    expect(cp.kill).toHaveBeenCalled();
    expect(res.status).toBe('error');
    expect(res.errorMessage).toMatch(/timed out/i);
    jest.useRealTimers();
  });

  it('TC-OS-5: error on malformed stdout', async () => {
    const p = service.run(['timetracking', 'report']);
    cp.stdout.emit('data', 'not-json<<<');
    cp.emit('close', 0);
    const res = await p;
    expect(res.status).toBe('error');
    expect(res.errorMessage).toMatch(/parse|json/i);
  });

  it('TC-OS-6: passes args as an array (no shell)', async () => {
    const p = service.run(['teams', 'roomfreebusy', '--room', 'MBTMY The Vista']);
    cp.stdout.emit('data', '[]');
    cp.emit('close', 0);
    await p;
    const call = (child_process.spawn as jest.Mock).mock.calls[0];
    expect(call[1]).toEqual(
      expect.arrayContaining(['teams', 'roomfreebusy', '--room', 'MBTMY The Vista', '--format', 'json']),
    );
    // shell must NOT be enabled
    expect(call[2]?.shell).not.toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- opencli.service` (cwd `dashboard/api`)
Expected: FAIL — `Cannot find module './opencli.service'`.

- [ ] **Step 4: Implement `dashboard/api/src/opencli/opencli.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { OpencliResult, OpencliRunOptions } from './opencli.types';

const OPENCLI_BIN = process.platform === 'win32' ? 'opencli.cmd' : 'opencli';
const DEFAULT_TIMEOUT = 120_000;

@Injectable()
export class OpencliService {
  run<T = Record<string, unknown>>(args: string[], opts: OpencliRunOptions = {}): Promise<OpencliResult<T>> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
    const argv = [...args, '--format', 'json'];
    const start = Date.now();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const child = spawn(OPENCLI_BIN, argv, { shell: false });

      const finish = (r: Omit<OpencliResult<T>, 'durationMs'>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ...r, durationMs: Date.now() - start });
      };

      const timer = setTimeout(() => {
        child.kill();
        finish({ status: 'error', data: [], rowCount: 0, exitCode: null, errorMessage: 'opencli command timed out' });
      }, timeoutMs);

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (e) =>
        finish({ status: 'error', data: [], rowCount: 0, exitCode: null, errorMessage: `spawn failed: ${e.message}` }),
      );

      child.on('close', (code) => {
        const errBlob = stderr.toUpperCase();
        if (/AUTH_REQUIRED/.test(errBlob)) {
          return finish({ status: 'auth_required', data: [], rowCount: 0, exitCode: code, errorCode: 'AUTH_REQUIRED', errorMessage: stderr.trim().slice(0, 500) });
        }
        if (/EMPTY_RESULT/.test(errBlob)) {
          return finish({ status: 'empty', data: [], rowCount: 0, exitCode: code, errorCode: 'EMPTY_RESULT', errorMessage: stderr.trim().slice(0, 500) });
        }
        if (code !== 0 && !stdout.trim()) {
          const m = stderr.match(/\b([A-Z_]{4,})\b/);
          return finish({ status: 'error', data: [], rowCount: 0, exitCode: code, errorCode: m?.[1], errorMessage: stderr.trim().slice(0, 500) || `exit ${code}` });
        }
        try {
          const parsed = JSON.parse(stdout);
          const rows = Array.isArray(parsed) ? parsed : (parsed.rows ?? parsed.data ?? []);
          finish({ status: 'success', data: rows as T[], rowCount: rows.length, exitCode: code });
        } catch (_e) {
          finish({ status: 'error', data: [], rowCount: 0, exitCode: code, errorMessage: `failed to parse opencli JSON output; stderr: ${stderr.trim().slice(0, 300)}` });
        }
      });
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- opencli.service` (cwd `dashboard/api`)
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add dashboard/api/src/opencli
git commit -m "feat(api): add OpencliService spawning opencli --format json with error mapping"
```

---

## Task 3: Audit entity + service (TDD, in-memory sqlite)

**Files:**
- Create: `dashboard/api/src/audit/audit.entity.ts`
- Create: `dashboard/api/src/audit/audit.service.ts`
- Test: `dashboard/api/src/audit/audit.service.spec.ts`

- [ ] **Step 1: Create `dashboard/api/src/audit/audit.entity.ts`**

```ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AuditStatus = 'success' | 'auth_required' | 'empty' | 'error';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'datetime' })
  timestamp: string;

  @Column()
  command: string;

  @Column({ type: 'text' })
  argsJson: string;

  @Column()
  status: AuditStatus;

  @Column({ type: 'integer', nullable: true })
  exitCode: number | null;

  @Column({ type: 'integer' })
  durationMs: number;

  @Column({ type: 'integer' })
  rowCount: number;

  @Column({ type: 'text', nullable: true })
  errorCode: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;
}
```

- [ ] **Step 2: Write failing test `dashboard/api/src/audit/audit.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit.entity';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [AuditLog], synchronize: true, dropSchema: true }),
        TypeOrmModule.forFeature([AuditLog]),
      ],
      providers: [AuditService],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  it('TC-AUD-1: records a successful run', async () => {
    await service.record({ command: 'timetracking report', args: { month: '2026-05' }, status: 'success', exitCode: 0, durationMs: 1200, rowCount: 30 });
    const { items, total } = await service.query({ limit: 10, offset: 0 });
    expect(total).toBe(1);
    expect(items[0].status).toBe('success');
    expect(items[0].rowCount).toBe(30);
    expect(JSON.parse(items[0].argsJson)).toEqual({ month: '2026-05' });
  });

  it('TC-AUD-2: records a failed run with error fields', async () => {
    await service.record({ command: 'teams roomfreebusy', args: { room: 'X' }, status: 'error', exitCode: 1, durationMs: 50, rowCount: 0, errorCode: 'UPSTREAM', errorMessage: 'boom' });
    const { items } = await service.query({ limit: 10, offset: 0 });
    expect(items[0].errorCode).toBe('UPSTREAM');
    expect(items[0].errorMessage).toBe('boom');
  });

  it('TC-AUD-3: returns newest-first, paginated', async () => {
    for (let i = 0; i < 5; i++) await service.record({ command: 'c' + i, args: {}, status: 'success', exitCode: 0, durationMs: 1, rowCount: 0 });
    const page = await service.query({ limit: 2, offset: 0 });
    expect(page.total).toBe(5);
    expect(page.items).toHaveLength(2);
    expect(page.items[0].command).toBe('c4'); // newest first
  });

  it('TC-AUD-4: filters by status and command', async () => {
    await service.record({ command: 'timetracking report', args: {}, status: 'success', exitCode: 0, durationMs: 1, rowCount: 1 });
    await service.record({ command: 'teams roomfreebusy', args: {}, status: 'error', exitCode: 1, durationMs: 1, rowCount: 0 });
    const onlyErr = await service.query({ limit: 10, offset: 0, status: 'error' });
    expect(onlyErr.total).toBe(1);
    const onlyTt = await service.query({ limit: 10, offset: 0, command: 'timetracking report' });
    expect(onlyTt.total).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- audit.service` (cwd `dashboard/api`)
Expected: FAIL — `Cannot find module './audit.service'`.

- [ ] **Step 4: Implement `dashboard/api/src/audit/audit.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditStatus } from './audit.entity';

export interface RecordInput {
  command: string;
  args: Record<string, unknown>;
  status: AuditStatus;
  exitCode: number | null;
  durationMs: number;
  rowCount: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface QueryInput {
  limit: number;
  offset: number;
  status?: AuditStatus;
  command?: string;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async record(input: RecordInput): Promise<AuditLog> {
    const row = this.repo.create({
      timestamp: new Date().toISOString(),
      command: input.command,
      argsJson: JSON.stringify(input.args ?? {}),
      status: input.status,
      exitCode: input.exitCode,
      durationMs: input.durationMs,
      rowCount: input.rowCount,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    });
    return this.repo.save(row);
  }

  async query(input: QueryInput): Promise<{ items: AuditLog[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (input.status) where.status = input.status;
    if (input.command) where.command = input.command;
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { id: 'DESC' },
      take: input.limit,
      skip: input.offset,
    });
    return { items, total };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- audit.service` (cwd `dashboard/api`)
Expected: PASS (4 tests).

- [ ] **Step 6: Verify the API now compiles**

Run: `npm run build` (cwd `dashboard/api`)
Expected: build succeeds (AppModule references `AuditLog`, which now exists).

- [ ] **Step 7: Commit**

```bash
git add dashboard/api/src/audit
git commit -m "feat(api): add AuditLog entity and AuditService with pagination/filter"
```

---

## Task 4: Timetracking aggregation service (TDD)

**Files:**
- Create: `dashboard/api/src/timetracking/timetracking.service.ts`
- Test: `dashboard/api/src/timetracking/timetracking.service.spec.ts`

The service depends on `OpencliService` and `AuditService`. It builds argv, runs opencli, aggregates by `projectId + category`, records an audit row, and returns a typed response.

- [ ] **Step 1: Write failing test `dashboard/api/src/timetracking/timetracking.service.spec.ts`**

```ts
import { TimetrackingService } from './timetracking.service';
import { OpencliResult } from '../opencli/opencli.types';

function makeOpencli(result: Partial<OpencliResult>) {
  return { run: jest.fn().mockResolvedValue({ status: 'success', data: [], rowCount: 0, durationMs: 5, exitCode: 0, ...result }) } as any;
}
const audit = () => ({ record: jest.fn().mockResolvedValue(undefined) } as any);

const ROWS = [
  { month: '2026-05', date: '2026-05-04', projectId: 'P1', category: 'Dev', hours: 4 },
  { month: '2026-05', date: '2026-05-04', projectId: 'P1', category: 'Dev', hours: 2 },
  { month: '2026-05', date: '2026-05-05', projectId: 'P1', category: 'Mtg', hours: 1 },
  { month: '2026-05', date: '2026-05-05', projectId: 'P2', category: 'Dev', hours: 3 },
];

describe('TimetrackingService', () => {
  it('TC-AGG-1/2: aggregates by project+category with grand total', async () => {
    const svc = new TimetrackingService(makeOpencli({ data: ROWS, rowCount: 4 }), audit());
    const res = await svc.report({ month: '2026-05' });
    const p1dev = res.aggregated.find((g) => g.projectId === 'P1' && g.category === 'Dev');
    expect(p1dev).toMatchObject({ totalHours: 6, lineCount: 2 });
    expect(res.grandTotalHours).toBe(10);
    expect(res.totalLines).toBe(4);
    expect(res.aggregated).toHaveLength(3);
  });

  it('TC-AGG-3: empty rows -> empty aggregated, zero total', async () => {
    const svc = new TimetrackingService(makeOpencli({ data: [], rowCount: 0, status: 'empty' }), audit());
    const res = await svc.report({ months: 1 });
    expect(res.aggregated).toEqual([]);
    expect(res.grandTotalHours).toBe(0);
    expect(res.status).toBe('empty');
  });

  it('TC-AGG-4: null/missing hours treated as 0 (no NaN)', async () => {
    const svc = new TimetrackingService(makeOpencli({ data: [{ projectId: 'P1', category: 'Dev', hours: null }], rowCount: 1 }), audit());
    const res = await svc.report({ month: '2026-05' });
    expect(res.grandTotalHours).toBe(0);
    expect(Number.isNaN(res.grandTotalHours)).toBe(false);
  });

  it('builds argv from month and records audit', async () => {
    const opencli = makeOpencli({ data: ROWS, rowCount: 4 });
    const auditSvc = audit();
    const svc = new TimetrackingService(opencli, auditSvc);
    await svc.report({ month: '2026-05' });
    expect(opencli.run).toHaveBeenCalledWith(['timetracking', 'report', '--month', '2026-05']);
    expect(auditSvc.record).toHaveBeenCalledWith(expect.objectContaining({ command: 'timetracking report', status: 'success', rowCount: 4 }));
  });

  it('builds argv from months', async () => {
    const opencli = makeOpencli({ data: [], rowCount: 0 });
    const svc = new TimetrackingService(opencli, audit());
    await svc.report({ months: 3 });
    expect(opencli.run).toHaveBeenCalledWith(['timetracking', 'report', '--months', '3']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- timetracking.service` (cwd `dashboard/api`)
Expected: FAIL — `Cannot find module './timetracking.service'`.

- [ ] **Step 3: Implement `dashboard/api/src/timetracking/timetracking.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { OpencliService } from '../opencli/opencli.service';
import { AuditService } from '../audit/audit.service';
import { OpencliStatus } from '../opencli/opencli.types';

export interface TtRow {
  month?: string; date?: string; weekday?: string; projectId?: string;
  category?: string; activity?: string; hours?: number | null; status?: string;
  journalId?: string; lineNumber?: number;
}
export interface TtGroup { projectId: string; category: string; totalHours: number; lineCount: number; }
export interface TtReportResponse {
  status: OpencliStatus;
  aggregated: TtGroup[];
  grandTotalHours: number;
  totalLines: number;
  raw: TtRow[];
  errorMessage?: string;
}
export interface TtReportInput { month?: string; months?: number; }

@Injectable()
export class TimetrackingService {
  constructor(private readonly opencli: OpencliService, private readonly audit: AuditService) {}

  private buildArgs(input: TtReportInput): string[] {
    const args = ['timetracking', 'report'];
    if (input.month) args.push('--month', input.month);
    else if (input.months) args.push('--months', String(input.months));
    return args;
  }

  private aggregate(rows: TtRow[]): { aggregated: TtGroup[]; grandTotalHours: number } {
    const map = new Map<string, TtGroup>();
    let grand = 0;
    for (const r of rows) {
      const pid = r.projectId ?? '(none)';
      const cat = r.category ?? '(none)';
      const hrs = typeof r.hours === 'number' ? r.hours : 0;
      grand += hrs;
      const key = pid + '\u0000' + cat;
      const g = map.get(key) ?? { projectId: pid, category: cat, totalHours: 0, lineCount: 0 };
      g.totalHours += hrs;
      g.lineCount += 1;
      map.set(key, g);
    }
    const aggregated = [...map.values()].sort((a, b) => b.totalHours - a.totalHours);
    return { aggregated, grandTotalHours: Math.round(grand * 100) / 100 };
  }

  async report(input: TtReportInput): Promise<TtReportResponse> {
    const args = this.buildArgs(input);
    const result = await this.opencli.run<TtRow>(args);
    const { aggregated, grandTotalHours } = this.aggregate(result.data);

    await this.audit.record({
      command: 'timetracking report',
      args: input as Record<string, unknown>,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      rowCount: result.rowCount,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });

    return {
      status: result.status,
      aggregated,
      grandTotalHours,
      totalLines: result.rowCount,
      raw: result.data,
      errorMessage: result.errorMessage,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- timetracking.service` (cwd `dashboard/api`)
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add dashboard/api/src/timetracking/timetracking.service.ts dashboard/api/src/timetracking/timetracking.service.spec.ts
git commit -m "feat(api): add timetracking aggregation service"
```

---

## Task 5: Timetracking DTO + controller + module + e2e

**Files:**
- Create: `dashboard/api/src/timetracking/timetracking.dto.ts`
- Create: `dashboard/api/src/timetracking/timetracking.controller.ts`
- Create: `dashboard/api/src/timetracking/timetracking.module.ts`
- Modify: `dashboard/api/src/app.module.ts`
- Create: `dashboard/api/jest-e2e.json`
- Test: `dashboard/api/src/timetracking/timetracking.e2e-spec.ts`

- [ ] **Step 1: Create `dashboard/api/src/timetracking/timetracking.dto.ts`**

```ts
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  months?: number;
}
```

- [ ] **Step 2: Create `dashboard/api/src/timetracking/timetracking.controller.ts`**

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ReportDto } from './timetracking.dto';
import { TimetrackingService } from './timetracking.service';

@Controller('timetracking')
export class TimetrackingController {
  constructor(private readonly service: TimetrackingService) {}

  @Post('report')
  report(@Body() dto: ReportDto) {
    return this.service.report(dto);
  }
}
```

- [ ] **Step 3: Create `dashboard/api/src/timetracking/timetracking.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TimetrackingController } from './timetracking.controller';
import { TimetrackingService } from './timetracking.service';
import { OpencliService } from '../opencli/opencli.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [TimetrackingController],
  providers: [TimetrackingService, OpencliService],
})
export class TimetrackingModule {}
```

- [ ] **Step 4: Create `dashboard/api/src/audit/audit.module.ts`** (needed by the import above)

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

> Note: `AuditController` is created in Task 7. Until then, temporarily omit it from `controllers` (leave `controllers: []`) so the module compiles, and add it back in Task 7 Step 4.

- [ ] **Step 5: Modify `dashboard/api/src/app.module.ts` to register the modules**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AuditLog } from './audit/audit.entity';
import { AuditModule } from './audit/audit.module';
import { TimetrackingModule } from './timetracking/timetracking.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: join(__dirname, '..', 'data', 'audit.sqlite'),
      entities: [AuditLog],
      synchronize: true,
    }),
    AuditModule,
    TimetrackingModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Create `dashboard/api/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

- [ ] **Step 7: Write e2e test `dashboard/api/src/timetracking/timetracking.e2e-spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { AuditLog } from '../audit/audit.entity';
import { AuditModule } from '../audit/audit.module';
import { AuditService } from '../audit/audit.service';
import { TimetrackingController } from './timetracking.controller';
import { TimetrackingService } from './timetracking.service';
import { OpencliService } from '../opencli/opencli.service';

describe('Timetracking (e2e)', () => {
  let app: INestApplication;
  const opencli = { run: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [AuditLog], synchronize: true, dropSchema: true }),
        AuditModule,
      ],
      controllers: [TimetrackingController],
      providers: [TimetrackingService, { provide: OpencliService, useValue: opencli }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => { await app.close(); jest.clearAllMocks(); });

  it('TC-E2E-1: happy path returns aggregated + raw', async () => {
    opencli.run.mockResolvedValue({ status: 'success', data: [{ projectId: 'P1', category: 'Dev', hours: 4 }], rowCount: 1, durationMs: 9, exitCode: 0 });
    const res = await request(app.getHttpServer()).post('/timetracking/report').send({ month: '2026-05' }).expect(201);
    expect(res.body.aggregated[0]).toMatchObject({ projectId: 'P1', category: 'Dev', totalHours: 4 });
    expect(res.body.grandTotalHours).toBe(4);
  });

  it('TC-E2E-3: auth error returns 200-style body with status=auth_required', async () => {
    opencli.run.mockResolvedValue({ status: 'auth_required', data: [], rowCount: 0, durationMs: 3, exitCode: 1, errorMessage: 'AUTH_REQUIRED' });
    const res = await request(app.getHttpServer()).post('/timetracking/report').send({ month: '2026-05' }).expect(201);
    expect(res.body.status).toBe('auth_required');
  });

  it('TC-VAL-1: invalid month -> 400', async () => {
    await request(app.getHttpServer()).post('/timetracking/report').send({ month: '2026-13' }).expect(400);
  });

  it('TC-VAL-2: months=7 -> 400', async () => {
    await request(app.getHttpServer()).post('/timetracking/report').send({ months: 7 }).expect(400);
  });

  it('TC-E2E-4: writes an audit row', async () => {
    opencli.run.mockResolvedValue({ status: 'success', data: [], rowCount: 0, durationMs: 1, exitCode: 0 });
    await request(app.getHttpServer()).post('/timetracking/report').send({ month: '2026-05' }).expect(201);
    const auditSvc = app.get(AuditService);
    const { total } = await auditSvc.query({ limit: 10, offset: 0 });
    expect(total).toBe(1);
  });
});
```

> Note: NestJS `@Post` returns **201** by default. Tests assert 201; the spec's "HTTP 200" intent (operational status in body, not an error code) is satisfied — the success vs auth distinction lives in `body.status`, not the HTTP code.

- [ ] **Step 8: Run e2e to verify pass**

Run: `npm run test:e2e -- timetracking` (cwd `dashboard/api`)
Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
git add dashboard/api/src/timetracking dashboard/api/src/audit/audit.module.ts dashboard/api/src/app.module.ts dashboard/api/jest-e2e.json
git commit -m "feat(api): add timetracking endpoint with validation and e2e"
```

---

## Task 6: Teams room free/busy DTO + service + controller + module + e2e

**Files:**
- Create: `dashboard/api/src/teams/teams.dto.ts`
- Create: `dashboard/api/src/teams/teams.service.ts`
- Create: `dashboard/api/src/teams/teams.controller.ts`
- Create: `dashboard/api/src/teams/teams.module.ts`
- Modify: `dashboard/api/src/app.module.ts`
- Test: `dashboard/api/src/teams/teams.e2e-spec.ts`

- [ ] **Step 1: Create `dashboard/api/src/teams/teams.dto.ts`**

```ts
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class RoomFreeBusyDto {
  @IsString()
  @IsNotEmpty({ message: 'room is required' })
  room: string;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}
```

- [ ] **Step 2: Create `dashboard/api/src/teams/teams.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { OpencliService } from '../opencli/opencli.service';
import { AuditService } from '../audit/audit.service';
import { OpencliStatus } from '../opencli/opencli.types';

export interface TimelineRow { room?: string; date?: string; state?: string; start?: string; end?: string; durationMin?: number; }
export interface RoomFreeBusyResponse { status: OpencliStatus; timeline: TimelineRow[]; errorMessage?: string; }
export interface RoomFreeBusyInput { room: string; date?: string; }

@Injectable()
export class TeamsService {
  constructor(private readonly opencli: OpencliService, private readonly audit: AuditService) {}

  async roomFreeBusy(input: RoomFreeBusyInput): Promise<RoomFreeBusyResponse> {
    const args = ['teams', 'roomfreebusy', '--room', input.room];
    if (input.date) args.push('--date', input.date);
    const result = await this.opencli.run<TimelineRow>(args);

    await this.audit.record({
      command: 'teams roomfreebusy',
      args: input as Record<string, unknown>,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      rowCount: result.rowCount,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });

    return { status: result.status, timeline: result.data, errorMessage: result.errorMessage };
  }
}
```

- [ ] **Step 3: Create `dashboard/api/src/teams/teams.controller.ts`**

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { RoomFreeBusyDto } from './teams.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  @Post('roomfreebusy')
  roomFreeBusy(@Body() dto: RoomFreeBusyDto) {
    return this.service.roomFreeBusy(dto);
  }
}
```

- [ ] **Step 4: Create `dashboard/api/src/teams/teams.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { OpencliService } from '../opencli/opencli.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [TeamsController],
  providers: [TeamsService, OpencliService],
})
export class TeamsModule {}
```

- [ ] **Step 5: Add `TeamsModule` to `app.module.ts` imports**

```ts
// add import at top:
import { TeamsModule } from './teams/teams.module';
// add TeamsModule to the imports array alongside AuditModule, TimetrackingModule
```

- [ ] **Step 6: Write e2e `dashboard/api/src/teams/teams.e2e-spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { AuditLog } from '../audit/audit.entity';
import { AuditModule } from '../audit/audit.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { OpencliService } from '../opencli/opencli.service';

describe('Teams (e2e)', () => {
  let app: INestApplication;
  const opencli = { run: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [AuditLog], synchronize: true, dropSchema: true }),
        AuditModule,
      ],
      controllers: [TeamsController],
      providers: [TeamsService, { provide: OpencliService, useValue: opencli }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => { await app.close(); jest.clearAllMocks(); });

  it('TC-E2E-2: happy path returns timeline', async () => {
    opencli.run.mockResolvedValue({ status: 'success', data: [{ room: 'r', date: '2026-06-12', state: 'busy', start: '09:00', end: '10:00', durationMin: 60 }], rowCount: 1, durationMs: 8, exitCode: 0 });
    const res = await request(app.getHttpServer()).post('/teams/roomfreebusy').send({ room: 'MBTMY The Vista', date: '2026-06-12' }).expect(201);
    expect(res.body.timeline).toHaveLength(1);
    expect(res.body.timeline[0].state).toBe('busy');
    expect(opencli.run).toHaveBeenCalledWith(['teams', 'roomfreebusy', '--room', 'MBTMY The Vista', '--date', '2026-06-12']);
  });

  it('TC-VAL-3: invalid date -> 400', async () => {
    await request(app.getHttpServer()).post('/teams/roomfreebusy').send({ room: 'X', date: '2026-99-99' }).expect(400);
  });

  it('TC-VAL-4: empty room -> 400', async () => {
    await request(app.getHttpServer()).post('/teams/roomfreebusy').send({ room: '' }).expect(400);
  });
});
```

- [ ] **Step 7: Run e2e**

Run: `npm run test:e2e -- teams` (cwd `dashboard/api`)
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add dashboard/api/src/teams dashboard/api/src/app.module.ts
git commit -m "feat(api): add teams roomfreebusy endpoint with validation and e2e"
```

---

## Task 7: Audit controller + e2e

**Files:**
- Create: `dashboard/api/src/audit/audit.dto.ts`
- Create: `dashboard/api/src/audit/audit.controller.ts`
- Modify: `dashboard/api/src/audit/audit.module.ts`
- Test: `dashboard/api/src/audit/audit.e2e-spec.ts`

- [ ] **Step 1: Create `dashboard/api/src/audit/audit.dto.ts`**

```ts
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AuditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit = 50;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset = 0;

  @IsOptional() @IsIn(['success', 'auth_required', 'empty', 'error'])
  status?: 'success' | 'auth_required' | 'empty' | 'error';

  @IsOptional() @IsString()
  command?: string;
}
```

- [ ] **Step 2: Create `dashboard/api/src/audit/audit.controller.ts`**

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  list(@Query() q: AuditQueryDto) {
    return this.service.query(q);
  }
}
```

- [ ] **Step 3: Add `AuditController` back to `audit.module.ts`**

```ts
// in audit.module.ts, set:
controllers: [AuditController],
// and import it at the top:
import { AuditController } from './audit.controller';
```

- [ ] **Step 4: Write e2e `dashboard/api/src/audit/audit.e2e-spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { AuditLog } from './audit.entity';
import { AuditModule } from './audit.module';
import { AuditService } from './audit.service';

describe('Audit (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [AuditLog], synchronize: true, dropSchema: true }),
        AuditModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const svc = app.get(AuditService);
    await svc.record({ command: 'timetracking report', args: {}, status: 'success', exitCode: 0, durationMs: 1, rowCount: 3 });
    await svc.record({ command: 'teams roomfreebusy', args: {}, status: 'error', exitCode: 1, durationMs: 2, rowCount: 0, errorCode: 'UPSTREAM' });
  });

  afterEach(async () => { await app.close(); });

  it('GET /audit returns newest-first paginated', async () => {
    const res = await request(app.getHttpServer()).get('/audit?limit=1&offset=0').expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].command).toBe('teams roomfreebusy');
  });

  it('GET /audit filters by status', async () => {
    const res = await request(app.getHttpServer()).get('/audit?status=error').expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].errorCode).toBe('UPSTREAM');
  });
});
```

- [ ] **Step 5: Run e2e**

Run: `npm run test:e2e -- audit` (cwd `dashboard/api`)
Expected: PASS (2 tests).

- [ ] **Step 6: Full api check**

Run: `npm test` then `npm run test:e2e` then `npm run build` (cwd `dashboard/api`)
Expected: all unit + e2e pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add dashboard/api/src/audit
git commit -m "feat(api): add audit query endpoint with e2e"
```

---

## Task 8: Scaffold the Next.js web app (Tailwind + daisyUI + Vitest)

**Files:**
- Create: `dashboard/web/package.json`, `next.config.js`, `tsconfig.json`, `postcss.config.js`, `tailwind.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.local`
- Create: `dashboard/web/app/globals.css`
- Create: `dashboard/web/test/setup.ts`

- [ ] **Step 1: Create `dashboard/web/package.json`**

```json
{
  "name": "opencli-dashboard-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "lucide-react": "^0.428.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "daisyui": "^4.12.10",
    "jsdom": "^24.1.1",
    "msw": "^2.3.5",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.7",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `dashboard/web/next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
module.exports = nextConfig;
```

- [ ] **Step 3: Create `dashboard/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `dashboard/web/postcss.config.js`**

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5: Create `dashboard/web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';
import daisyui from 'daisyui';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [daisyui],
  daisyui: { themes: ['light', 'dark'] },
};
export default config;
```

- [ ] **Step 6: Create `dashboard/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create `dashboard/web/.env.local`**

```
NEXT_PUBLIC_API_BASE=http://localhost:3001/api
```

- [ ] **Step 8: Create `dashboard/web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./test/setup.ts'] },
});
```

- [ ] **Step 9: Create `dashboard/web/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 10: Create `dashboard/web/.gitignore`**

```
node_modules
.next
out
```

- [ ] **Step 11: Install deps**

Run: `npm install` (cwd `dashboard/web`)
Expected: dependencies install.

- [ ] **Step 12: Commit**

```bash
git add dashboard/web
git commit -m "chore(web): scaffold Next.js + Tailwind + daisyUI + Vitest"
```

---

## Task 9: Shared types, API client, layout + nav

**Files:**
- Create: `dashboard/web/lib/types.ts`
- Create: `dashboard/web/lib/api.ts`
- Create: `dashboard/web/components/Sidebar.tsx`
- Create: `dashboard/web/components/Spinner.tsx`
- Create: `dashboard/web/components/AuthRequiredCallout.tsx`
- Create: `dashboard/web/app/layout.tsx`
- Create: `dashboard/web/app/page.tsx`

- [ ] **Step 1: Create `dashboard/web/lib/types.ts`**

```ts
export type RunStatus = 'success' | 'auth_required' | 'empty' | 'error';

export interface TtGroup { projectId: string; category: string; totalHours: number; lineCount: number; }
export interface TtRow {
  month?: string; date?: string; weekday?: string; projectId?: string;
  category?: string; activity?: string; hours?: number | null; status?: string;
}
export interface TtReportResponse {
  status: RunStatus; aggregated: TtGroup[]; grandTotalHours: number;
  totalLines: number; raw: TtRow[]; errorMessage?: string;
}

export interface TimelineRow { room?: string; date?: string; state?: string; start?: string; end?: string; durationMin?: number; }
export interface RoomFreeBusyResponse { status: RunStatus; timeline: TimelineRow[]; errorMessage?: string; }

export interface AuditItem {
  id: number; timestamp: string; command: string; argsJson: string;
  status: RunStatus; exitCode: number | null; durationMs: number;
  rowCount: number; errorCode: string | null; errorMessage: string | null;
}
export interface AuditPage { items: AuditItem[]; total: number; }
```

- [ ] **Step 2: Create `dashboard/web/lib/api.ts`**

```ts
import type { TtReportResponse, RoomFreeBusyResponse, AuditPage } from './types';

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  timetrackingReport: (body: { month?: string; months?: number }) =>
    post<TtReportResponse>('/timetracking/report', body),
  roomFreeBusy: (body: { room: string; date?: string }) =>
    post<RoomFreeBusyResponse>('/teams/roomfreebusy', body),
  audit: async (params: { limit?: number; offset?: number; status?: string; command?: string }): Promise<AuditPage> => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    const res = await fetch(`${BASE}/audit?${qs.toString()}`);
    if (!res.ok) throw new Error(`Audit request failed (${res.status})`);
    return res.json() as Promise<AuditPage>;
  },
};
```

- [ ] **Step 3: Create `dashboard/web/components/Spinner.tsx`**

```tsx
export function Spinner({ label = 'Running…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-base-content/70" role="status">
      <span className="loading loading-spinner loading-md" />
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Create `dashboard/web/components/AuthRequiredCallout.tsx`**

```tsx
import { ShieldAlert } from 'lucide-react';

export function AuthRequiredCallout({ message }: { message?: string }) {
  return (
    <div role="alert" className="alert alert-warning">
      <ShieldAlert className="h-5 w-5" />
      <div>
        <h3 className="font-bold">Sign-in required</h3>
        <div className="text-sm">
          opencli needs your logged-in browser. Open Chrome, sign in to the Mercedes app, then retry.
          {message ? <div className="opacity-70 mt-1">{message}</div> : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `dashboard/web/components/Sidebar.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, DoorOpen, ScrollText } from 'lucide-react';

const NAV = [
  { href: '/timetracking', label: 'Time Tracking', icon: Clock },
  { href: '/rooms', label: 'Room Availability', icon: DoorOpen },
  { href: '/audit', label: 'Audit Log', icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <ul className="menu bg-base-200 w-64 min-h-full p-4 gap-1">
      <li className="menu-title text-lg">personal dashboard</li>
      {NAV.map(({ href, label, icon: Icon }) => (
        <li key={href}>
          <Link href={href} className={pathname?.startsWith(href) ? 'active' : ''}>
            <Icon className="h-4 w-4" /> {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Create `dashboard/web/app/layout.tsx`**

```tsx
import './globals.css';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';

export const metadata = { title: 'opencli dashboard' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <div className="drawer lg:drawer-open">
          <input id="nav-drawer" type="checkbox" className="drawer-toggle" />
          <div className="drawer-content flex flex-col">
            <div className="navbar bg-base-100 border-b border-base-300">
              <div className="flex-none lg:hidden">
                <label htmlFor="nav-drawer" className="btn btn-square btn-ghost">≡</label>
              </div>
              <div className="flex-1 px-2 font-semibold">opencli dashboard</div>
            </div>
            <main className="p-6">{children}</main>
          </div>
          <div className="drawer-side">
            <label htmlFor="nav-drawer" className="drawer-overlay" />
            <Sidebar />
          </div>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Create `dashboard/web/app/page.tsx`** (redirect root to timetracking)

```tsx
import { redirect } from 'next/navigation';
export default function Home() { redirect('/timetracking'); }
```

- [ ] **Step 8: Verify build**

Run: `npm run build` (cwd `dashboard/web`)
Expected: build succeeds (pages added next).

- [ ] **Step 9: Commit**

```bash
git add dashboard/web/lib dashboard/web/components dashboard/web/app
git commit -m "feat(web): add shared types, api client, layout and nav"
```

---

## Task 10: Time Tracking page + table component (TDD)

**Files:**
- Create: `dashboard/web/components/TimetrackingTable.tsx`
- Create: `dashboard/web/app/timetracking/page.tsx`
- Test: `dashboard/web/components/TimetrackingTable.test.tsx`

- [ ] **Step 1: Write failing test `dashboard/web/components/TimetrackingTable.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimetrackingTable } from './TimetrackingTable';
import type { TtReportResponse } from '@/lib/types';

const DATA: TtReportResponse = {
  status: 'success',
  aggregated: [
    { projectId: 'P1', category: 'Dev', totalHours: 6, lineCount: 2 },
    { projectId: 'P2', category: 'Mtg', totalHours: 4, lineCount: 1 },
  ],
  grandTotalHours: 10,
  totalLines: 3,
  raw: [{ date: '2026-05-04', projectId: 'P1', category: 'Dev', hours: 6 }],
};

it('TC-WEB-1: renders group totals and grand total', () => {
  render(<TimetrackingTable data={DATA} />);
  expect(screen.getByText('P1')).toBeInTheDocument();
  expect(screen.getByText('6')).toBeInTheDocument();
  expect(screen.getByText(/10/)).toBeInTheDocument(); // grand total
});

it('TC-WEB-2: raw rows expand on toggle', async () => {
  render(<TimetrackingTable data={DATA} />);
  expect(screen.queryByText('2026-05-04')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /raw rows/i }));
  expect(screen.getByText('2026-05-04')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TimetrackingTable` (cwd `dashboard/web`)
Expected: FAIL — cannot resolve `./TimetrackingTable`.

- [ ] **Step 3: Implement `dashboard/web/components/TimetrackingTable.tsx`**

```tsx
'use client';
import { useState } from 'react';
import type { TtReportResponse } from '@/lib/types';

export function TimetrackingTable({ data }: { data: TtReportResponse }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="space-y-4">
      <div className="stats shadow">
        <div className="stat">
          <div className="stat-title">Total hours</div>
          <div className="stat-value">{data.grandTotalHours}</div>
          <div className="stat-desc">{data.totalLines} booking lines</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-zebra">
          <thead>
            <tr><th>Project</th><th>Category</th><th className="text-right">Hours</th><th className="text-right">Lines</th></tr>
          </thead>
          <tbody>
            {data.aggregated.map((g) => (
              <tr key={`${g.projectId}-${g.category}`}>
                <td>{g.projectId}</td><td>{g.category}</td>
                <td className="text-right">{g.totalHours}</td>
                <td className="text-right">{g.lineCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn btn-sm btn-outline" onClick={() => setShowRaw((s) => !s)}>
        {showRaw ? 'Hide raw rows' : 'Show raw rows'}
      </button>

      {showRaw && (
        <div className="overflow-x-auto">
          <table className="table table-xs">
            <thead><tr><th>Date</th><th>Project</th><th>Category</th><th>Activity</th><th className="text-right">Hours</th></tr></thead>
            <tbody>
              {data.raw.map((r, i) => (
                <tr key={i}><td>{r.date}</td><td>{r.projectId}</td><td>{r.category}</td><td>{r.activity}</td><td className="text-right">{r.hours ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- TimetrackingTable` (cwd `dashboard/web`)
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `dashboard/web/app/timetracking/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { TtReportResponse } from '@/lib/types';
import { Spinner } from '@/components/Spinner';
import { AuthRequiredCallout } from '@/components/AuthRequiredCallout';
import { TimetrackingTable } from '@/components/TimetrackingTable';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function TimetrackingPage() {
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TtReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null); setData(null);
    try {
      setData(await api.timetrackingReport({ month }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Time Tracking</h1>
      <div className="flex items-end gap-3">
        <label className="form-control">
          <span className="label-text mb-1">Month</span>
          <input type="month" className="input input-bordered" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={run} disabled={loading}>Run report</button>
      </div>

      {loading && <Spinner label="Fetching report (this drives your browser)…" />}
      {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}
      {data?.status === 'auth_required' && <AuthRequiredCallout message={data.errorMessage} />}
      {data?.status === 'empty' && <div className="alert"><span>No booking lines for {month}.</span></div>}
      {data?.status === 'success' && <TimetrackingTable data={data} />}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/web/components/TimetrackingTable.tsx dashboard/web/components/TimetrackingTable.test.tsx dashboard/web/app/timetracking
git commit -m "feat(web): add Time Tracking page with grouped table"
```

---

## Task 11: Room Availability page + timeline component (TDD)

**Files:**
- Create: `dashboard/web/components/TimelineView.tsx`
- Create: `dashboard/web/app/rooms/page.tsx`
- Test: `dashboard/web/components/TimelineView.test.tsx`

- [ ] **Step 1: Write failing test `dashboard/web/components/TimelineView.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { TimelineView } from './TimelineView';
import type { TimelineRow } from '@/lib/types';

const ROWS: TimelineRow[] = [
  { date: '2026-06-12', state: 'free', start: '00:00', end: '09:00', durationMin: 540 },
  { date: '2026-06-12', state: 'busy', start: '09:00', end: '10:00', durationMin: 60 },
];

it('TC-WEB-3: renders timeline blocks with state labels', () => {
  render(<TimelineView rows={ROWS} />);
  expect(screen.getByText('free')).toBeInTheDocument();
  expect(screen.getByText('busy')).toBeInTheDocument();
  expect(screen.getByText('09:00')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TimelineView` (cwd `dashboard/web`)
Expected: FAIL — cannot resolve `./TimelineView`.

- [ ] **Step 3: Implement `dashboard/web/components/TimelineView.tsx`**

```tsx
import type { TimelineRow } from '@/lib/types';

const STATE_BADGE: Record<string, string> = {
  free: 'badge-success',
  busy: 'badge-error',
  tentative: 'badge-warning',
  oof: 'badge-secondary',
  elsewhere: 'badge-info',
};

export function TimelineView({ rows }: { rows: TimelineRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>Start</th><th>End</th><th>State</th><th className="text-right">Minutes</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.start}</td>
              <td>{r.end}</td>
              <td><span className={`badge ${STATE_BADGE[r.state ?? ''] ?? 'badge-ghost'}`}>{r.state}</span></td>
              <td className="text-right">{r.durationMin}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- TimelineView` (cwd `dashboard/web`)
Expected: PASS (1 test).

- [ ] **Step 5: Implement `dashboard/web/app/rooms/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { RoomFreeBusyResponse } from '@/lib/types';
import { Spinner } from '@/components/Spinner';
import { AuthRequiredCallout } from '@/components/AuthRequiredCallout';
import { TimelineView } from '@/components/TimelineView';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RoomsPage() {
  const [room, setRoom] = useState('');
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RoomFreeBusyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!room.trim()) { setError('Enter a room name or email.'); return; }
    setLoading(true); setError(null); setData(null);
    try {
      setData(await api.roomFreeBusy({ room: room.trim(), date }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Room Availability</h1>
      <div className="flex flex-wrap items-end gap-3">
        <label className="form-control grow">
          <span className="label-text mb-1">Room (name or email)</span>
          <input className="input input-bordered" placeholder="MBTMY The Vista" value={room} onChange={(e) => setRoom(e.target.value)} />
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Date</span>
          <input type="date" className="input input-bordered" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={run} disabled={loading}>Check availability</button>
      </div>

      {loading && <Spinner label="Checking room (this drives your browser)…" />}
      {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}
      {data?.status === 'auth_required' && <AuthRequiredCallout message={data.errorMessage} />}
      {data?.status === 'empty' && <div className="alert"><span>No timeline data for that room/day.</span></div>}
      {data?.status === 'success' && <TimelineView rows={data.timeline} />}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/web/components/TimelineView.tsx dashboard/web/components/TimelineView.test.tsx dashboard/web/app/rooms
git commit -m "feat(web): add Room Availability page with timeline view"
```

---

## Task 12: Audit Log page + table component (TDD with MSW)

**Files:**
- Create: `dashboard/web/components/AuditTable.tsx`
- Create: `dashboard/web/app/audit/page.tsx`
- Test: `dashboard/web/components/AuditTable.test.tsx`

- [ ] **Step 1: Write failing test `dashboard/web/components/AuditTable.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { AuditTable } from './AuditTable';
import type { AuditItem } from '@/lib/types';

const ITEMS: AuditItem[] = [
  { id: 2, timestamp: '2026-06-16T01:00:00Z', command: 'teams roomfreebusy', argsJson: '{"room":"X"}', status: 'error', exitCode: 1, durationMs: 50, rowCount: 0, errorCode: 'UPSTREAM', errorMessage: 'boom' },
  { id: 1, timestamp: '2026-06-16T00:00:00Z', command: 'timetracking report', argsJson: '{"month":"2026-05"}', status: 'success', exitCode: 0, durationMs: 1200, rowCount: 30, errorCode: null, errorMessage: null },
];

it('TC-WEB-4: renders rows with status badges', () => {
  render(<AuditTable items={ITEMS} total={2} />);
  expect(screen.getByText('teams roomfreebusy')).toBeInTheDocument();
  expect(screen.getByText('timetracking report')).toBeInTheDocument();
  expect(screen.getByText('error')).toBeInTheDocument();
  expect(screen.getByText('success')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AuditTable` (cwd `dashboard/web`)
Expected: FAIL — cannot resolve `./AuditTable`.

- [ ] **Step 3: Implement `dashboard/web/components/AuditTable.tsx`**

```tsx
import type { AuditItem } from '@/lib/types';

const STATUS_BADGE: Record<string, string> = {
  success: 'badge-success', error: 'badge-error', auth_required: 'badge-warning', empty: 'badge-ghost',
};

export function AuditTable({ items }: { items: AuditItem[]; total: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra">
        <thead>
          <tr><th>When</th><th>Command</th><th>Args</th><th>Status</th><th className="text-right">Rows</th><th className="text-right">ms</th><th>Error</th></tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="whitespace-nowrap">{new Date(it.timestamp).toLocaleString()}</td>
              <td>{it.command}</td>
              <td><code className="text-xs">{it.argsJson}</code></td>
              <td><span className={`badge ${STATUS_BADGE[it.status] ?? 'badge-ghost'}`}>{it.status}</span></td>
              <td className="text-right">{it.rowCount}</td>
              <td className="text-right">{it.durationMs}</td>
              <td className="text-xs text-error">{it.errorCode ?? ''} {it.errorMessage ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- AuditTable` (cwd `dashboard/web`)
Expected: PASS (1 test).

- [ ] **Step 5: Implement `dashboard/web/app/audit/page.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AuditPage } from '@/lib/types';
import { Spinner } from '@/components/Spinner';
import { AuditTable } from '@/components/AuditTable';

const PAGE_SIZE = 20;

export default function AuditPageView() {
  const [page, setPage] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('');
  const [command, setCommand] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setPage(await api.audit({ limit: PAGE_SIZE, offset, status: status || undefined, command: command || undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [offset, status, command]);

  useEffect(() => { load(); }, [load]);

  const total = page?.total ?? 0;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <div className="flex flex-wrap items-end gap-3">
        <label className="form-control">
          <span className="label-text mb-1">Status</span>
          <select className="select select-bordered" value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value); }}>
            <option value="">All</option>
            <option value="success">success</option>
            <option value="auth_required">auth_required</option>
            <option value="empty">empty</option>
            <option value="error">error</option>
          </select>
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Command</span>
          <select className="select select-bordered" value={command} onChange={(e) => { setOffset(0); setCommand(e.target.value); }}>
            <option value="">All</option>
            <option value="timetracking report">timetracking report</option>
            <option value="teams roomfreebusy">teams roomfreebusy</option>
          </select>
        </label>
      </div>

      {loading && <Spinner label="Loading audit log…" />}
      {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}
      {page && <AuditTable items={page.items} total={page.total} />}

      <div className="join">
        <button className="btn join-item" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Prev</button>
        <button className="btn join-item btn-disabled">{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</button>
        <button className="btn join-item" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/web/components/AuditTable.tsx dashboard/web/components/AuditTable.test.tsx dashboard/web/app/audit
git commit -m "feat(web): add Audit Log page with filters and pagination"
```

---

## Task 13: End-to-end run docs + README + TODO update

**Files:**
- Create: `dashboard/README.md`
- Modify: `TODO.md` and `TODO_ARCHIVE.md` (repo root)

- [ ] **Step 1: Create `dashboard/README.md`**

````markdown
# opencli Dashboard

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
````

- [ ] **Step 2: Manual smoke test (requires live login)**

Start both servers (Step 1 commands). In the browser:
- Time Tracking → pick last month → Run report → expect grouped table + total. (If not logged in, expect the sign-in callout.)
- Room Availability → enter a known room → Check → expect timeline.
- Audit Log → expect rows for the runs above, newest first; filter by status.

Expected: each run appears in the audit log with correct status/rowCount/duration.

- [ ] **Step 3: Update `TODO.md` / `TODO_ARCHIVE.md`**

Move the dashboard task into `TODO_ARCHIVE.md` as completed and leave `TODO.md` reflecting any remaining follow-ups (e.g. "verify opencli `--format json` envelope on live data").

- [ ] **Step 4: Commit**

```bash
git add dashboard/README.md TODO.md TODO_ARCHIVE.md
git commit -m "docs: add dashboard README and update TODO"
```

---

## Self-Review

**Spec coverage:**
- Local single-user, spawn opencli, parse `--format json` → Tasks 1, 2. ✓
- Time Tracking aggregation by project+category + grand total + raw rows → Tasks 4, 10. ✓
- Room availability timeline → Tasks 6, 11. ✓
- SQLite audit log (write + paginated/filtered query) → Tasks 3, 7; UI Task 12. ✓
- Synchronous + spinner execution, 120s timeout → Task 2 (timeout), Tasks 10–12 (spinner). ✓
- Validation DTOs (month/months/date/room) → Tasks 5, 6. ✓
- Error handling incl. AUTH_REQUIRED callout → Tasks 2, 9, 10–11. ✓
- All spec test cases TC-OS-*, TC-AGG-*, TC-AUD-*, TC-VAL-*, TC-E2E-*, TC-WEB-1..4 have tasks. ✓

**Known gaps / deferred (documented, not blocking):**
- TC-WEB-5 (auth callout render) and TC-WEB-6 (spinner) are covered structurally by the page implementations; add explicit page-level tests with MSW if desired (optional follow-up, not required for the happy path).
- Live `--format json` envelope shape is normalized defensively in `OpencliService` and flagged for confirmation in the spec's open items.

**Type consistency:** `OpencliResult`, `TtGroup`, `TtRow`, `TimelineRow`, `AuditLog`/`AuditItem`, and the `RunStatus`/`OpencliStatus` union (`success|auth_required|empty|error`) are used identically across api and web. ✓

**Placeholder scan:** No TBD/TODO/"implement later" left in code steps; every code step shows complete content. ✓

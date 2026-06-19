# Time Tracking Goals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-project monthly goals to the Time Tracking dashboard — CRUD, progress cards, inline table progress, and pace countdown.

**Architecture:** New `GoalsModule` in the NestJS API with a `goals` SQLite table. The existing `TimetrackingService` is enriched to include goals in the report response. Front-end adds goal cards, inline progress bars, a manage-goals section, and pure pace-calculation helpers.

**Tech Stack:** NestJS 10 + TypeORM + better-sqlite3 (API), Next.js 14 + React 18 + Tailwind + daisyUI (web), Jest (API tests), Vitest + Testing Library (web tests).

**Spec:** `docs/superpowers/specs/2026-06-16-timetracking-goals-design.md`

---

## File Map

### API — new files

| File | Responsibility |
|------|---------------|
| `dashboard/api/src/goals/goal.entity.ts` | TypeORM entity for the `goals` table |
| `dashboard/api/src/goals/goal.dto.ts` | Validation DTOs for create and query |
| `dashboard/api/src/goals/goals.service.ts` | CRUD logic (upsert, find by month, delete) |
| `dashboard/api/src/goals/goals.service.spec.ts` | Unit tests (in-memory SQLite) |
| `dashboard/api/src/goals/goals.controller.ts` | REST endpoints: GET, POST, DELETE |
| `dashboard/api/src/goals/goals.module.ts` | NestJS module wiring |
| `dashboard/api/src/goals/goals.e2e-spec.ts` | E2E tests (supertest) |

### API — modified files

| File | Change |
|------|--------|
| `dashboard/api/src/app.module.ts` | Import `GoalsModule`, add `Goal` to entities |
| `dashboard/api/src/timetracking/timetracking.service.ts` | Inject `GoalsService`, add `goals` to report response |
| `dashboard/api/src/timetracking/timetracking.module.ts` | Import `GoalsModule` |

### Web — new files

| File | Responsibility |
|------|---------------|
| `dashboard/web/lib/goals.ts` | Pure pace-calculation helpers |
| `dashboard/web/lib/goals.test.ts` | Unit tests for pace helpers |
| `dashboard/web/components/GoalProgressBar.tsx` | Reusable progress bar with color logic |
| `dashboard/web/components/GoalCards.tsx` | Row of goal progress cards |
| `dashboard/web/components/GoalCards.test.tsx` | Tests for GoalCards |
| `dashboard/web/components/ManageGoals.tsx` | Collapsible CRUD section |
| `dashboard/web/components/ManageGoals.test.tsx` | Tests for ManageGoals |

### Web — modified files

| File | Change |
|------|--------|
| `dashboard/web/lib/types.ts` | Add `Goal` type, update `TtReportResponse` |
| `dashboard/web/lib/api.ts` | Add goals CRUD methods |
| `dashboard/web/components/TimetrackingTable.tsx` | Add "Goal" column with inline progress |
| `dashboard/web/components/TimetrackingTable.test.tsx` | Update tests for goal column |
| `dashboard/web/app/timetracking/page.tsx` | Wire GoalCards, ManageGoals, pass goals state |

---

## Task 1: Goal entity

**Files:**
- Create: `dashboard/api/src/goals/goal.entity.ts`

- [ ] **Step 1: Create the Goal entity**

```typescript
// dashboard/api/src/goals/goal.entity.ts
import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('goals')
@Unique(['month', 'projectId'])
export class Goal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  month: string;

  @Column({ type: 'text' })
  projectId: string;

  @Column({ type: 'real' })
  targetDays: number;

  @Column({ type: 'real' })
  targetHours: number;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: string;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  updatedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/api/src/goals/goal.entity.ts
git commit -m "feat(goals): add Goal TypeORM entity"
```

---

## Task 2: GoalsService with tests (TDD)

**Files:**
- Create: `dashboard/api/src/goals/goals.service.ts`
- Create: `dashboard/api/src/goals/goals.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// dashboard/api/src/goals/goals.service.spec.ts
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './goal.entity';
import { GoalsService } from './goals.service';

describe('GoalsService', () => {
  let service: GoalsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [Goal], synchronize: true, dropSchema: true }),
        TypeOrmModule.forFeature([Goal]),
      ],
      providers: [GoalsService],
    }).compile();
    service = moduleRef.get(GoalsService);
  });

  it('TC-GOAL-1: creates a goal with targetHours = targetDays * 8', async () => {
    const goal = await service.upsert({ month: '2026-06', projectId: 'P1', targetDays: 16.5 });
    expect(goal.id).toBeDefined();
    expect(goal.targetDays).toBe(16.5);
    expect(goal.targetHours).toBe(132);
    expect(goal.month).toBe('2026-06');
    expect(goal.projectId).toBe('P1');
  });

  it('TC-GOAL-2: upserts when same (month, projectId) exists', async () => {
    const g1 = await service.upsert({ month: '2026-06', projectId: 'P1', targetDays: 10 });
    const g2 = await service.upsert({ month: '2026-06', projectId: 'P1', targetDays: 16.5 });
    expect(g2.id).toBe(g1.id);
    expect(g2.targetDays).toBe(16.5);
    expect(g2.targetHours).toBe(132);
  });

  it('TC-GOAL-3: findByMonth returns only goals for that month', async () => {
    await service.upsert({ month: '2026-06', projectId: 'P1', targetDays: 10 });
    await service.upsert({ month: '2026-07', projectId: 'P1', targetDays: 5 });
    const june = await service.findByMonth('2026-06');
    expect(june).toHaveLength(1);
    expect(june[0].month).toBe('2026-06');
  });

  it('TC-GOAL-4: delete removes a goal', async () => {
    const g = await service.upsert({ month: '2026-06', projectId: 'P1', targetDays: 10 });
    const result = await service.remove(g.id);
    expect(result).toEqual({ deleted: true });
    const all = await service.findByMonth('2026-06');
    expect(all).toHaveLength(0);
  });

  it('TC-GOAL-5: delete non-existent returns null', async () => {
    const result = await service.remove(999);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/api && npx jest --testPathPattern goals.service.spec --verbose`
Expected: FAIL — `GoalsService` module not found.

- [ ] **Step 3: Write the GoalsService implementation**

```typescript
// dashboard/api/src/goals/goals.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal } from './goal.entity';

export interface UpsertGoalInput {
  month: string;
  projectId: string;
  targetDays: number;
}

@Injectable()
export class GoalsService {
  constructor(@InjectRepository(Goal) private readonly repo: Repository<Goal>) {}

  async upsert(input: UpsertGoalInput): Promise<Goal> {
    const targetHours = input.targetDays * 8;
    const existing = await this.repo.findOne({
      where: { month: input.month, projectId: input.projectId },
    });
    if (existing) {
      existing.targetDays = input.targetDays;
      existing.targetHours = targetHours;
      existing.updatedAt = new Date().toISOString();
      return this.repo.save(existing);
    }
    const goal = this.repo.create({
      month: input.month,
      projectId: input.projectId,
      targetDays: input.targetDays,
      targetHours,
    });
    return this.repo.save(goal);
  }

  async findByMonth(month: string): Promise<Goal[]> {
    return this.repo.find({ where: { month }, order: { projectId: 'ASC' } });
  }

  async remove(id: number): Promise<{ deleted: true } | null> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) return null;
    return { deleted: true };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd dashboard/api && npx jest --testPathPattern goals.service.spec --verbose`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/api/src/goals/goals.service.ts dashboard/api/src/goals/goals.service.spec.ts
git commit -m "feat(goals): GoalsService with upsert/findByMonth/remove + tests"
```

---

## Task 3: Goal DTOs

**Files:**
- Create: `dashboard/api/src/goals/goal.dto.ts`

- [ ] **Step 1: Create validation DTOs**

```typescript
// dashboard/api/src/goals/goal.dto.ts
import { IsNotEmpty, IsNumber, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGoalDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month: string;

  @IsString()
  @IsNotEmpty({ message: 'projectId must not be empty' })
  projectId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.5, { message: 'targetDays must be at least 0.5' })
  @Max(31, { message: 'targetDays must be at most 31' })
  targetDays: number;
}

export class GoalQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/api/src/goals/goal.dto.ts
git commit -m "feat(goals): add CreateGoalDto and GoalQueryDto"
```

---

## Task 4: GoalsController

**Files:**
- Create: `dashboard/api/src/goals/goals.controller.ts`

- [ ] **Step 1: Create the controller**

```typescript
// dashboard/api/src/goals/goals.controller.ts
import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { CreateGoalDto, GoalQueryDto } from './goal.dto';

@Controller('goals')
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Get()
  findByMonth(@Query() query: GoalQueryDto) {
    return this.service.findByMonth(query.month);
  }

  @Post()
  @HttpCode(200)
  upsert(@Body() dto: CreateGoalDto) {
    return this.service.upsert(dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const result = await this.service.remove(id);
    if (!result) throw new NotFoundException(`Goal ${id} not found`);
    return result;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/api/src/goals/goals.controller.ts
git commit -m "feat(goals): GoalsController with GET/POST/DELETE"
```

---

## Task 5: GoalsModule + wire into AppModule

**Files:**
- Create: `dashboard/api/src/goals/goals.module.ts`
- Modify: `dashboard/api/src/app.module.ts`

- [ ] **Step 1: Create GoalsModule**

```typescript
// dashboard/api/src/goals/goals.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './goal.entity';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Goal])],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
```

- [ ] **Step 2: Register Goal entity and GoalsModule in AppModule**

In `dashboard/api/src/app.module.ts`, add `Goal` to the entities array and `GoalsModule` to imports:

```typescript
// dashboard/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AuditLog } from './audit/audit.entity';
import { Goal } from './goals/goal.entity';
import { AuditModule } from './audit/audit.module';
import { GoalsModule } from './goals/goals.module';
import { TimetrackingModule } from './timetracking/timetracking.module';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: join(__dirname, '..', 'data', 'audit.sqlite'),
      entities: [AuditLog, Goal],
      synchronize: true,
    }),
    AuditModule,
    GoalsModule,
    TimetrackingModule,
    TeamsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `cd dashboard/api && npx jest --verbose`
Expected: All existing tests pass + goals tests pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/api/src/goals/goals.module.ts dashboard/api/src/app.module.ts
git commit -m "feat(goals): wire GoalsModule into AppModule"
```

---

## Task 6: Goals e2e tests

**Files:**
- Create: `dashboard/api/src/goals/goals.e2e-spec.ts`

- [ ] **Step 1: Write e2e tests**

```typescript
// dashboard/api/src/goals/goals.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Goal } from './goal.entity';
import { GoalsModule } from './goals.module';

describe('Goals e2e', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [Goal], synchronize: true, dropSchema: true }),
        GoalsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  it('TC-GVAL-1: POST without month → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/goals')
      .send({ projectId: 'P1', targetDays: 10 })
      .expect(400);
  });

  it('TC-GVAL-2: POST with invalid month → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/goals')
      .send({ month: '2026-13', projectId: 'P1', targetDays: 10 })
      .expect(400);
  });

  it('TC-GVAL-3: POST without projectId → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/goals')
      .send({ month: '2026-06', targetDays: 10 })
      .expect(400);
  });

  it('TC-GVAL-4: POST with targetDays=0 → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/goals')
      .send({ month: '2026-06', projectId: 'P1', targetDays: 0 })
      .expect(400);
  });

  it('TC-GVAL-5: POST with targetDays=32 → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/goals')
      .send({ month: '2026-06', projectId: 'P1', targetDays: 32 })
      .expect(400);
  });

  it('TC-GVAL-6: GET without month → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/goals')
      .expect(400);
  });

  it('POST + GET happy path', async () => {
    await request(app.getHttpServer())
      .post('/api/goals')
      .send({ month: '2026-06', projectId: 'P1', targetDays: 16.5 })
      .expect(200)
      .expect((res) => {
        expect(res.body.targetDays).toBe(16.5);
        expect(res.body.targetHours).toBe(132);
      });

    await request(app.getHttpServer())
      .get('/api/goals?month=2026-06')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveLength(1);
        expect(res.body[0].projectId).toBe('P1');
      });
  });

  it('DELETE happy path', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/goals')
      .send({ month: '2026-06', projectId: 'P1', targetDays: 10 })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/goals/${body.id}`)
      .expect(200)
      .expect((res) => expect(res.body.deleted).toBe(true));
  });

  it('TC-GOAL-5: DELETE non-existent → 404', async () => {
    await request(app.getHttpServer())
      .delete('/api/goals/999')
      .expect(404);
  });
});
```

- [ ] **Step 2: Run e2e tests**

Run: `cd dashboard/api && npx jest --config jest-e2e.json --testPathPattern goals.e2e --verbose`
Expected: All 8 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add dashboard/api/src/goals/goals.e2e-spec.ts
git commit -m "test(goals): e2e tests for Goals CRUD + validation"
```

---

## Task 7: Enrich TimetrackingService report with goals

**Files:**
- Modify: `dashboard/api/src/timetracking/timetracking.service.ts`
- Modify: `dashboard/api/src/timetracking/timetracking.module.ts`

- [ ] **Step 1: Import GoalsModule in TimetrackingModule**

In `dashboard/api/src/timetracking/timetracking.module.ts`, add the import:

```typescript
// dashboard/api/src/timetracking/timetracking.module.ts
import { Module } from '@nestjs/common';
import { TimetrackingController } from './timetracking.controller';
import { TimetrackingService } from './timetracking.service';
import { OpencliService } from '../opencli/opencli.service';
import { AuditModule } from '../audit/audit.module';
import { GoalsModule } from '../goals/goals.module';

@Module({
  imports: [AuditModule, GoalsModule],
  controllers: [TimetrackingController],
  providers: [TimetrackingService, OpencliService],
})
export class TimetrackingModule {}
```

- [ ] **Step 2: Update TtReportResponse and TimetrackingService**

In `dashboard/api/src/timetracking/timetracking.service.ts`, make two changes:

**Change 1:** Add `Goal` import and `goals` field to `TtReportResponse`:

Find:
```typescript
import { OpencliService } from '../opencli/opencli.service';
import { AuditService } from '../audit/audit.service';
import { OpencliStatus } from '../opencli/opencli.types';
```
Replace with:
```typescript
import { OpencliService } from '../opencli/opencli.service';
import { AuditService } from '../audit/audit.service';
import { GoalsService } from '../goals/goals.service';
import { OpencliStatus } from '../opencli/opencli.types';
import { Goal } from '../goals/goal.entity';
```

**Change 2:** Add `goals` to the response interface:

Find:
```typescript
export interface TtReportResponse {
  status: OpencliStatus;
  aggregated: TtGroup[];
  grandTotalHours: number;
  totalLines: number;
  raw: TtRow[];
  errorMessage?: string;
}
```
Replace with:
```typescript
export interface TtReportResponse {
  status: OpencliStatus;
  aggregated: TtGroup[];
  grandTotalHours: number;
  totalLines: number;
  raw: TtRow[];
  goals: Goal[];
  errorMessage?: string;
}
```

**Change 3:** Inject `GoalsService` and fetch goals in `report()`:

Find:
```typescript
  constructor(private readonly opencli: OpencliService, private readonly audit: AuditService) {}
```
Replace with:
```typescript
  constructor(private readonly opencli: OpencliService, private readonly audit: AuditService, private readonly goalsService: GoalsService) {}
```

**Change 4:** Add goals to the report response. Find the return block:

Find:
```typescript
    return {
      status: result.status,
      aggregated,
      grandTotalHours,
      totalLines: result.rowCount,
      raw: result.data,
      errorMessage: result.errorMessage,
    };
```
Replace with:
```typescript
    const month = input.month || new Date().toISOString().slice(0, 7);
    const goals = await this.goalsService.findByMonth(month);

    return {
      status: result.status,
      aggregated,
      grandTotalHours,
      totalLines: result.rowCount,
      raw: result.data,
      goals,
      errorMessage: result.errorMessage,
    };
```

- [ ] **Step 3: Run all api tests**

Run: `cd dashboard/api && npx jest --verbose`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/api/src/timetracking/timetracking.service.ts dashboard/api/src/timetracking/timetracking.module.ts
git commit -m "feat(goals): enrich timetracking report response with goals"
```

---

## Task 8: Frontend types and API client

**Files:**
- Modify: `dashboard/web/lib/types.ts`
- Modify: `dashboard/web/lib/api.ts`

- [ ] **Step 1: Add Goal type and update TtReportResponse**

In `dashboard/web/lib/types.ts`, add the `Goal` interface and update `TtReportResponse`:

Find:
```typescript
export interface TtReportResponse {
  status: RunStatus; aggregated: TtGroup[]; grandTotalHours: number;
  totalLines: number; raw: TtRow[]; errorMessage?: string;
}
```
Replace with:
```typescript
export interface Goal {
  id: number; month: string; projectId: string;
  targetDays: number; targetHours: number;
  createdAt: string; updatedAt: string;
}
export interface TtReportResponse {
  status: RunStatus; aggregated: TtGroup[]; grandTotalHours: number;
  totalLines: number; raw: TtRow[]; goals: Goal[]; errorMessage?: string;
}
```

- [ ] **Step 2: Add goals CRUD methods to the API client**

In `dashboard/web/lib/api.ts`, add imports and methods:

Find:
```typescript
import type { TtReportResponse, RoomFreeBusyResponse, AuditPage } from './types';
```
Replace with:
```typescript
import type { TtReportResponse, RoomFreeBusyResponse, AuditPage, Goal } from './types';
```

Find:
```typescript
export const api = {
```
Replace with:
```typescript
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
```

Then at the end of the `api` object, before the closing `};`, add the goals methods. Find:

```typescript
  audit: async (params: { limit?: number; offset?: number; status?: string; command?: string }): Promise<AuditPage> => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    const res = await fetch(`${BASE}/audit?${qs.toString()}`);
    if (!res.ok) throw new Error(`Audit request failed (${res.status})`);
    return res.json() as Promise<AuditPage>;
  },
};
```
Replace with:
```typescript
  audit: async (params: { limit?: number; offset?: number; status?: string; command?: string }): Promise<AuditPage> => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    const res = await fetch(`${BASE}/audit?${qs.toString()}`);
    if (!res.ok) throw new Error(`Audit request failed (${res.status})`);
    return res.json() as Promise<AuditPage>;
  },
  getGoals: (month: string) => get<Goal[]>(`/goals?month=${month}`),
  upsertGoal: (body: { month: string; projectId: string; targetDays: number }) => post<Goal>('/goals', body),
  deleteGoal: (id: number) => del<{ deleted: true }>(`/goals/${id}`),
};
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/web/lib/types.ts dashboard/web/lib/api.ts
git commit -m "feat(goals): add Goal type + API client CRUD methods"
```

---

## Task 9: Pace calculation helpers (TDD)

**Files:**
- Create: `dashboard/web/lib/goals.test.ts`
- Create: `dashboard/web/lib/goals.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// dashboard/web/lib/goals.test.ts
import { workingDaysInMonth, workingDaysElapsed, computeGoalProgress } from './goals';

describe('workingDaysInMonth', () => {
  it('TC-PACE-1: June 2026 has 22 weekdays', () => {
    expect(workingDaysInMonth('2026-06')).toBe(22);
  });

  it('February 2026 has 20 weekdays', () => {
    expect(workingDaysInMonth('2026-02')).toBe(20);
  });
});

describe('workingDaysElapsed', () => {
  it('TC-PACE-2: June 1-16 2026 (Mon-Mon) = 11 weekdays', () => {
    expect(workingDaysElapsed('2026-06', '2026-06-16')).toBe(11);
  });

  it('TC-PACE-3: past month → all working days elapsed', () => {
    expect(workingDaysElapsed('2026-05', '2026-06-16')).toBe(21); // May 2026 has 21 weekdays
  });

  it('first day of month = 1 if weekday, 0 if weekend', () => {
    // June 1 2026 is a Monday
    expect(workingDaysElapsed('2026-06', '2026-06-01')).toBe(1);
  });
});

describe('computeGoalProgress', () => {
  it('TC-PACE-4: returns reached when actual >= target', () => {
    const result = computeGoalProgress({ targetHours: 100, actualHours: 100, month: '2026-06', today: '2026-06-16' });
    expect(result.status).toBe('reached');
    expect(result.daysRemaining).toBe(0);
  });

  it('TC-PACE-5: returns on_track when actual >= expected pace', () => {
    // 22 working days, 11 elapsed, target 176h → expected 88h. Actual 90h → on_track
    const result = computeGoalProgress({ targetHours: 176, actualHours: 90, month: '2026-06', today: '2026-06-16' });
    expect(result.status).toBe('on_track');
  });

  it('returns behind when behind pace but < 80% elapsed', () => {
    // 22 working days, 5 elapsed (25%), target 176h → expected 40h. Actual 20h → behind
    const result = computeGoalProgress({ targetHours: 176, actualHours: 20, month: '2026-06', today: '2026-06-05' });
    expect(result.status).toBe('behind');
  });

  it('returns at_risk when behind pace and >= 80% elapsed', () => {
    // 22 working days, 20 elapsed (~91%), target 176h → expected 160h. Actual 80h → at_risk
    const result = computeGoalProgress({ targetHours: 176, actualHours: 80, month: '2026-06', today: '2026-06-26' });
    expect(result.status).toBe('at_risk');
  });

  it('TC-PACE-6: hoursPerDayNeeded is 0 when goal reached', () => {
    const result = computeGoalProgress({ targetHours: 100, actualHours: 120, month: '2026-06', today: '2026-06-16' });
    expect(result.hoursPerDayNeeded).toBe(0);
    expect(result.daysRemaining).toBe(0);
  });

  it('computes correct hoursPerDayNeeded', () => {
    // 22 working days, 11 elapsed, 11 remaining, target 132h, actual 80h → need 52h / 11d = 4.73
    const result = computeGoalProgress({ targetHours: 132, actualHours: 80, month: '2026-06', today: '2026-06-16' });
    expect(result.hoursPerDayNeeded).toBeCloseTo(4.727, 2);
    expect(result.daysRemaining).toBeCloseTo(6.5, 1);
    expect(result.percentage).toBeCloseTo(60.6, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/web && npx vitest run lib/goals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// dashboard/web/lib/goals.ts
export type PaceStatus = 'reached' | 'on_track' | 'behind' | 'at_risk';

export interface GoalProgress {
  status: PaceStatus;
  percentage: number;
  daysRemaining: number;
  hoursPerDayNeeded: number;
  workingDaysTotal: number;
  workingDaysElapsed: number;
  workingDaysRemaining: number;
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function workingDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (isWeekday(new Date(y, m - 1, d))) count++;
  }
  return count;
}

export function workingDaysElapsed(month: string, todayStr: string): number {
  const [y, m] = month.split('-').map(Number);
  const today = new Date(todayStr + 'T00:00:00');
  const lastDay = new Date(y, m, 0);
  const end = today > lastDay ? lastDay : today;

  let count = 0;
  for (let d = 1; d <= end.getDate(); d++) {
    const date = new Date(y, m - 1, d);
    if (date > end) break;
    if (isWeekday(date)) count++;
  }
  return count;
}

export function computeGoalProgress(input: {
  targetHours: number;
  actualHours: number;
  month: string;
  today: string;
}): GoalProgress {
  const { targetHours, actualHours, month, today } = input;
  const wdTotal = workingDaysInMonth(month);
  const wdElapsed = workingDaysElapsed(month, today);
  const wdRemaining = wdTotal - wdElapsed;

  const percentage = targetHours > 0 ? (actualHours / targetHours) * 100 : 0;
  const daysRemaining = Math.max(0, (targetHours - actualHours) / 8);

  if (actualHours >= targetHours) {
    return { status: 'reached', percentage, daysRemaining: 0, hoursPerDayNeeded: 0, workingDaysTotal: wdTotal, workingDaysElapsed: wdElapsed, workingDaysRemaining: wdRemaining };
  }

  const expectedHours = wdTotal > 0 ? (targetHours / wdTotal) * wdElapsed : 0;
  const hoursPerDayNeeded = wdRemaining > 0 ? Math.max(0, (targetHours - actualHours) / wdRemaining) : 0;

  let status: PaceStatus;
  if (actualHours >= expectedHours) {
    status = 'on_track';
  } else if (wdTotal > 0 && wdElapsed / wdTotal < 0.8) {
    status = 'behind';
  } else {
    status = 'at_risk';
  }

  return { status, percentage, daysRemaining, hoursPerDayNeeded, workingDaysTotal: wdTotal, workingDaysElapsed: wdElapsed, workingDaysRemaining: wdRemaining };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd dashboard/web && npx vitest run lib/goals.test.ts`
Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/web/lib/goals.ts dashboard/web/lib/goals.test.ts
git commit -m "feat(goals): pace calculation helpers with tests"
```

---

## Task 10: GoalProgressBar component

**Files:**
- Create: `dashboard/web/components/GoalProgressBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
// dashboard/web/components/GoalProgressBar.tsx
import type { PaceStatus } from '@/lib/goals';

const COLOR: Record<PaceStatus, string> = {
  reached: 'progress-success',
  on_track: 'progress-success',
  behind: 'progress-warning',
  at_risk: 'progress-error',
};

export function GoalProgressBar({ percentage, status, className = '' }: { percentage: number; status: PaceStatus; className?: string }) {
  return (
    <progress
      className={`progress ${COLOR[status]} ${className}`}
      value={Math.min(percentage, 100)}
      max={100}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/web/components/GoalProgressBar.tsx
git commit -m "feat(goals): GoalProgressBar component"
```

---

## Task 11: GoalCards component (TDD)

**Files:**
- Create: `dashboard/web/components/GoalCards.test.tsx`
- Create: `dashboard/web/components/GoalCards.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// dashboard/web/components/GoalCards.test.tsx
import { render, screen } from '@testing-library/react';
import { GoalCards } from './GoalCards';
import type { Goal } from '@/lib/types';
import type { TtGroup } from '@/lib/types';

const GOALS: Goal[] = [
  { id: 1, month: '2026-06', projectId: 'P1', targetDays: 16.5, targetHours: 132, createdAt: '', updatedAt: '' },
];

const AGGREGATED: TtGroup[] = [
  { projectId: 'P1', category: 'Dev', totalHours: 60, lineCount: 10 },
  { projectId: 'P1', category: 'Mtg', totalHours: 20, lineCount: 5 },
  { projectId: 'P2', category: 'Dev', totalHours: 40, lineCount: 8 },
];

it('TC-CARD-1: renders one card per goal with correct info', () => {
  render(<GoalCards goals={GOALS} aggregated={AGGREGATED} month="2026-06" today="2026-06-16" />);
  expect(screen.getByText('P1')).toBeInTheDocument();
  expect(screen.getByText(/80/)).toBeInTheDocument(); // 60+20 actual hours
  expect(screen.getByText(/132h/)).toBeInTheDocument(); // target
});

it('TC-CARD-3: shows Goal reached when actual >= target', () => {
  const reachedGoals: Goal[] = [
    { id: 1, month: '2026-06', projectId: 'P1', targetDays: 5, targetHours: 40, createdAt: '', updatedAt: '' },
  ];
  const agg: TtGroup[] = [{ projectId: 'P1', category: 'Dev', totalHours: 50, lineCount: 10 }];
  render(<GoalCards goals={reachedGoals} aggregated={agg} month="2026-06" today="2026-06-16" />);
  expect(screen.getByText(/Goal reached/i)).toBeInTheDocument();
});

it('TC-CARD-5: no cards when goals empty', () => {
  const { container } = render(<GoalCards goals={[]} aggregated={AGGREGATED} month="2026-06" today="2026-06-16" />);
  expect(container.children).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/web && npx vitest run components/GoalCards.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the GoalCards component**

```tsx
// dashboard/web/components/GoalCards.tsx
'use client';
import type { Goal, TtGroup } from '@/lib/types';
import { computeGoalProgress } from '@/lib/goals';
import { GoalProgressBar } from './GoalProgressBar';
import { CheckCircle } from 'lucide-react';

function actualHoursForProject(projectId: string, aggregated: TtGroup[]): number {
  return aggregated
    .filter((g) => g.projectId === projectId)
    .reduce((sum, g) => sum + g.totalHours, 0);
}

export function GoalCards({ goals, aggregated, month, today }: {
  goals: Goal[];
  aggregated: TtGroup[];
  month: string;
  today: string;
}) {
  if (goals.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4">
      {goals.map((goal) => {
        const actual = actualHoursForProject(goal.projectId, aggregated);
        const progress = computeGoalProgress({
          targetHours: goal.targetHours,
          actualHours: actual,
          month,
          today,
        });

        return (
          <div key={goal.id} className="card bg-base-200 shadow-sm w-72">
            <div className="card-body p-4">
              <h3 className="card-title text-sm font-mono">{goal.projectId}</h3>
              <GoalProgressBar percentage={progress.percentage} status={progress.status} className="w-full" />
              <p className="text-sm">
                {Math.round(actual * 10) / 10} / {goal.targetHours}h ({Math.round(progress.percentage)}%)
              </p>
              {progress.status === 'reached' ? (
                <p className="text-success flex items-center gap-1 text-sm">
                  <CheckCircle size={16} /> Goal reached!
                </p>
              ) : (
                <>
                  <p className="text-sm opacity-70">
                    {Math.round(progress.daysRemaining * 10) / 10} days remaining
                  </p>
                  {progress.workingDaysRemaining > 0 && (
                    <p className="text-xs opacity-50">
                      Book {Math.round(progress.hoursPerDayNeeded * 10) / 10}h/day for the remaining {progress.workingDaysRemaining} work days
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd dashboard/web && npx vitest run components/GoalCards.test.tsx`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/web/components/GoalCards.tsx dashboard/web/components/GoalCards.test.tsx
git commit -m "feat(goals): GoalCards component with tests"
```

---

## Task 12: ManageGoals component (TDD)

**Files:**
- Create: `dashboard/web/components/ManageGoals.test.tsx`
- Create: `dashboard/web/components/ManageGoals.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// dashboard/web/components/ManageGoals.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManageGoals } from './ManageGoals';
import type { Goal } from '@/lib/types';

const GOALS: Goal[] = [
  { id: 1, month: '2026-06', projectId: 'P1', targetDays: 16.5, targetHours: 132, createdAt: '', updatedAt: '' },
];

const noop = () => {};

it('TC-MGMT-5: section is collapsed by default', () => {
  render(<ManageGoals goals={GOALS} month="2026-06" onGoalChange={noop} knownProjects={[]} />);
  // The goals table rows should not be visible
  expect(screen.queryByText('P1')).not.toBeInTheDocument();
});

it('TC-MGMT-1: renders existing goals when expanded', async () => {
  render(<ManageGoals goals={GOALS} month="2026-06" onGoalChange={noop} knownProjects={[]} />);
  await userEvent.click(screen.getByRole('button', { name: /goals/i }));
  expect(screen.getByText('P1')).toBeInTheDocument();
  expect(screen.getByText('16.5')).toBeInTheDocument();
  expect(screen.getByText('132')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/web && npx vitest run components/ManageGoals.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the ManageGoals component**

```tsx
// dashboard/web/components/ManageGoals.tsx
'use client';
import { useState } from 'react';
import { Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { Goal } from '@/lib/types';

export function ManageGoals({ goals, month, onGoalChange, knownProjects }: {
  goals: Goal[];
  month: string;
  onGoalChange: () => void;
  knownProjects: string[];
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [targetDays, setTargetDays] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const days = parseFloat(targetDays);
    if (!projectId.trim() || isNaN(days) || days < 0.5 || days > 31) return;
    setBusy(true);
    try {
      await api.upsertGoal({ month, projectId: projectId.trim(), targetDays: days });
      setProjectId('');
      setTargetDays('');
      onGoalChange();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    setBusy(true);
    try {
      await api.deleteGoal(id);
      onGoalChange();
    } finally {
      setBusy(false);
    }
  }

  async function handleEditSave(goal: Goal) {
    const days = parseFloat(editValue);
    if (isNaN(days) || days < 0.5 || days > 31) { setEditingId(null); return; }
    setBusy(true);
    try {
      await api.upsertGoal({ month: goal.month, projectId: goal.projectId, targetDays: days });
      setEditingId(null);
      onGoalChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        className="btn btn-sm btn-ghost gap-1"
        onClick={() => setOpen((o) => !o)}
        aria-label="Goals"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Goals ({goals.length})
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {goals.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr><th>Project</th><th className="text-right">Target (days)</th><th className="text-right">Target (hours)</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {goals.map((g) => (
                    <tr key={g.id}>
                      <td className="font-mono text-xs">{g.projectId}</td>
                      <td className="text-right">
                        {editingId === g.id ? (
                          <input
                            type="number"
                            step="0.5"
                            className="input input-bordered input-xs w-20 text-right"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleEditSave(g)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(g); if (e.key === 'Escape') setEditingId(null); }}
                            autoFocus
                          />
                        ) : (
                          g.targetDays
                        )}
                      </td>
                      <td className="text-right">{g.targetHours}</td>
                      <td className="flex gap-1">
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => { setEditingId(g.id); setEditValue(String(g.targetDays)); }}
                          disabled={busy}
                          aria-label={`Edit goal ${g.projectId}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-xs text-error"
                          onClick={() => handleDelete(g.id)}
                          disabled={busy}
                          aria-label={`Delete goal ${g.projectId}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-end gap-2">
            {knownProjects.length > 0 ? (
              <select
                className="select select-bordered select-sm"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Select project…</option>
                {knownProjects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Project ID"
                className="input input-bordered input-sm w-48"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              />
            )}
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="31"
              placeholder="Days"
              className="input input-bordered input-sm w-24"
              value={targetDays}
              onChange={(e) => setTargetDays(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={busy}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd dashboard/web && npx vitest run components/ManageGoals.test.tsx`
Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/web/components/ManageGoals.tsx dashboard/web/components/ManageGoals.test.tsx
git commit -m "feat(goals): ManageGoals component with tests"
```

---

## Task 13: Update TimetrackingTable with Goal column (TDD)

**Files:**
- Modify: `dashboard/web/components/TimetrackingTable.tsx`
- Modify: `dashboard/web/components/TimetrackingTable.test.tsx`

- [ ] **Step 1: Update the test file**

Add new tests and update the existing test data to include `goals`. In `dashboard/web/components/TimetrackingTable.test.tsx`:

Replace the entire file content with:

```tsx
// dashboard/web/components/TimetrackingTable.test.tsx
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
  goals: [],
};

const DATA_WITH_GOALS: TtReportResponse = {
  ...DATA,
  goals: [
    { id: 1, month: '2026-06', projectId: 'P1', targetDays: 16.5, targetHours: 132, createdAt: '', updatedAt: '' },
  ],
};

it('TC-WEB-1: renders group totals and grand total', () => {
  render(<TimetrackingTable data={DATA} month="2026-06" />);
  expect(screen.getByText('P1')).toBeInTheDocument();
  expect(screen.getByText('6')).toBeInTheDocument();
  expect(screen.getByText(/10/)).toBeInTheDocument();
});

it('TC-WEB-2: raw rows expand on toggle', async () => {
  render(<TimetrackingTable data={DATA} month="2026-06" />);
  expect(screen.queryByText('2026-05-04')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /raw rows/i }));
  expect(screen.getByText('2026-05-04')).toBeInTheDocument();
});

it('TC-INLINE-1: Goal column appears when goals exist', () => {
  render(<TimetrackingTable data={DATA_WITH_GOALS} month="2026-06" />);
  expect(screen.getByText('Goal')).toBeInTheDocument();
});

it('TC-INLINE-2: no Goal column when goals empty', () => {
  render(<TimetrackingTable data={DATA} month="2026-06" />);
  expect(screen.queryByText('Goal')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/web && npx vitest run components/TimetrackingTable.test.tsx`
Expected: FAIL — `TimetrackingTable` doesn't accept `month` prop yet.

- [ ] **Step 3: Update TimetrackingTable component**

Replace the entire content of `dashboard/web/components/TimetrackingTable.tsx`:

```tsx
// dashboard/web/components/TimetrackingTable.tsx
'use client';
import { useState } from 'react';
import type { TtReportResponse } from '@/lib/types';
import { computeGoalProgress } from '@/lib/goals';
import { GoalProgressBar } from './GoalProgressBar';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimetrackingTable({ data, month }: { data: TtReportResponse; month: string }) {
  const [showRaw, setShowRaw] = useState(false);
  const hasGoals = data.goals.length > 0;

  // Pre-compute actual hours per project for goal matching
  const projectHours = new Map<string, number>();
  for (const g of data.aggregated) {
    projectHours.set(g.projectId, (projectHours.get(g.projectId) ?? 0) + g.totalHours);
  }

  // Build goal lookup by projectId
  const goalMap = new Map(data.goals.map((g) => [g.projectId, g]));

  // Track which project has already shown its badge (first row only)
  const shownBadge = new Set<string>();

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
            <tr>
              <th>Project</th><th>Category</th><th className="text-right">Hours</th><th className="text-right">Lines</th>
              {hasGoals && <th className="text-right">Goal</th>}
            </tr>
          </thead>
          <tbody>
            {data.aggregated.map((g) => {
              const goal = goalMap.get(g.projectId);
              const actual = projectHours.get(g.projectId) ?? 0;
              const progress = goal ? computeGoalProgress({ targetHours: goal.targetHours, actualHours: actual, month, today: todayStr() }) : null;
              const isFirstRow = goal && !shownBadge.has(g.projectId);
              if (isFirstRow) shownBadge.add(g.projectId);

              return (
                <tr key={`${g.projectId}-${g.category}`}>
                  <td>{g.projectId}</td><td>{g.category}</td>
                  <td className="text-right">{g.totalHours}</td>
                  <td className="text-right">{g.lineCount}</td>
                  {hasGoals && (
                    <td className="text-right">
                      {progress ? (
                        <div className="flex items-center justify-end gap-2">
                          <GoalProgressBar percentage={progress.percentage} status={progress.status} className="w-24" />
                          <span className="text-xs">{Math.round(progress.percentage)}%</span>
                          {isFirstRow && progress.status !== 'reached' && (
                            <span className="badge badge-info badge-xs">{Math.round(progress.daysRemaining * 10) / 10}d left</span>
                          )}
                          {isFirstRow && progress.status === 'reached' && (
                            <span className="badge badge-success badge-xs">done</span>
                          )}
                        </div>
                      ) : (
                        <span className="opacity-30">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd dashboard/web && npx vitest run components/TimetrackingTable.test.tsx`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/web/components/TimetrackingTable.tsx dashboard/web/components/TimetrackingTable.test.tsx
git commit -m "feat(goals): add Goal column to TimetrackingTable"
```

---

## Task 14: Wire everything into TimetrackingPage

**Files:**
- Modify: `dashboard/web/app/timetracking/page.tsx`

- [ ] **Step 1: Update the page to include GoalCards, ManageGoals, and pass goals state**

Replace the entire content of `dashboard/web/app/timetracking/page.tsx`:

```tsx
// dashboard/web/app/timetracking/page.tsx
'use client';
import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { TtReportResponse } from '@/lib/types';
import type { Goal } from '@/lib/types';
import { Spinner } from '@/components/Spinner';
import { AuthRequiredCallout } from '@/components/AuthRequiredCallout';
import { TimetrackingTable } from '@/components/TimetrackingTable';
import { GoalCards } from '@/components/GoalCards';
import { ManageGoals } from '@/components/ManageGoals';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function TimetrackingPage() {
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TtReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);

  async function run() {
    setLoading(true); setError(null); setData(null);
    try {
      const result = await api.timetrackingReport({ month });
      setData(result);
      setGoals(result.goals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const refreshGoals = useCallback(async () => {
    try {
      const g = await api.getGoals(month);
      setGoals(g);
      // Also update data.goals if report data is loaded
      if (data && data.status === 'success') {
        setData({ ...data, goals: g });
      }
    } catch { /* silently fail — goals panel will show stale data */ }
  }, [month, data]);

  // Collect known project IDs from the last report run
  const knownProjects = data?.status === 'success'
    ? [...new Set(data.aggregated.map((g) => g.projectId))]
    : [];

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

      <ManageGoals goals={goals} month={month} onGoalChange={refreshGoals} knownProjects={knownProjects} />

      {loading && <Spinner label="Fetching report (this drives your browser)…" />}
      {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}
      {data?.status === 'auth_required' && <AuthRequiredCallout message={data.errorMessage} />}
      {data?.status === 'empty' && <div className="alert"><span>No booking lines for {month}.</span></div>}
      {data?.status === 'success' && (
        <>
          <GoalCards goals={goals} aggregated={data.aggregated} month={month} today={todayStr()} />
          <TimetrackingTable data={data} month={month} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run all web tests**

Run: `cd dashboard/web && npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Run all api tests**

Run: `cd dashboard/api && npx jest --verbose`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/web/app/timetracking/page.tsx
git commit -m "feat(goals): wire GoalCards + ManageGoals into TimetrackingPage"
```

---

## Self-Review Checklist

### Spec coverage

| Spec section | Task(s) |
|-------------|---------|
| §3 Data Model | Task 1 |
| §4.1 Goals CRUD | Tasks 2–5 |
| §4.2 Enriched report | Task 7 |
| §4.3 Validation | Tasks 3, 6 |
| §5 Goal Cards | Tasks 10, 11 |
| §6 Inline Progress | Task 13 |
| §7 Manage Goals | Task 12 |
| §8 Pace Calculation | Task 9 |
| §9 Component Structure | All web tasks |
| §10 Test Cases | Tasks 2, 6, 9, 11, 12, 13 |

### Placeholder scan

No TBDs, TODOs, or "implement later" found. All code blocks contain complete implementations.

### Type consistency

- `Goal` entity: same shape in entity (Task 1), types.ts (Task 8), tests (Tasks 11, 13).
- `GoalsService.upsert/findByMonth/remove`: consistent across service (Task 2), controller (Task 4), timetracking service (Task 7).
- `computeGoalProgress`: consistent in lib/goals.ts (Task 9), GoalCards (Task 11), TimetrackingTable (Task 13).
- `TtReportResponse.goals`: added in API (Task 7) and frontend types (Task 8).

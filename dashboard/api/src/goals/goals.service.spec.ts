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

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

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
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

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
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

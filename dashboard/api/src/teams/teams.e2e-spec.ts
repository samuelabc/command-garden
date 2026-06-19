import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
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

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  it('TC-GVAL-1: POST without month → 400', async () => {
    await request(app.getHttpServer())
      .post('/goals')
      .send({ projectId: 'P1', targetDays: 10 })
      .expect(400);
  });

  it('TC-GVAL-2: POST with invalid month → 400', async () => {
    await request(app.getHttpServer())
      .post('/goals')
      .send({ month: '2026-13', projectId: 'P1', targetDays: 10 })
      .expect(400);
  });

  it('TC-GVAL-3: POST without projectId → 400', async () => {
    await request(app.getHttpServer())
      .post('/goals')
      .send({ month: '2026-06', targetDays: 10 })
      .expect(400);
  });

  it('TC-GVAL-4: POST with targetDays=0 → 400', async () => {
    await request(app.getHttpServer())
      .post('/goals')
      .send({ month: '2026-06', projectId: 'P1', targetDays: 0 })
      .expect(400);
  });

  it('TC-GVAL-5: POST with targetDays=32 → 400', async () => {
    await request(app.getHttpServer())
      .post('/goals')
      .send({ month: '2026-06', projectId: 'P1', targetDays: 32 })
      .expect(400);
  });

  it('TC-GVAL-6: GET without month → 400', async () => {
    await request(app.getHttpServer())
      .get('/goals')
      .expect(400);
  });

  it('POST + GET happy path', async () => {
    await request(app.getHttpServer())
      .post('/goals')
      .send({ month: '2026-06', projectId: 'P1', targetDays: 16.5 })
      .expect(200)
      .expect((res) => {
        expect(res.body.targetDays).toBe(16.5);
        expect(res.body.targetHours).toBe(132);
      });

    await request(app.getHttpServer())
      .get('/goals?month=2026-06')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveLength(1);
        expect(res.body[0].projectId).toBe('P1');
      });
  });

  it('DELETE happy path', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/goals')
      .send({ month: '2026-06', projectId: 'P1', targetDays: 10 })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/goals/${body.id}`)
      .expect(200)
      .expect((res) => expect(res.body.deleted).toBe(true));
  });

  it('TC-GOAL-5: DELETE non-existent → 404', async () => {
    await request(app.getHttpServer())
      .delete('/goals/999')
      .expect(404);
  });
});

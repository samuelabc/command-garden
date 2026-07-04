import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AuditLog } from './audit/audit.entity';
import { Goal } from './goals/goal.entity';
import { AuditModule } from './audit/audit.module';
import { GoalsModule } from './goals/goals.module';
import { TimetrackingModule } from './timetracking/timetracking.module';
import { TeamsModule } from './teams/teams.module';
import { JournalModule } from './journal/journal.module';

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
    JournalModule,
  ],
})
export class AppModule {}

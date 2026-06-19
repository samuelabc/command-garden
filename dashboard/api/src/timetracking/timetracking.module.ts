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

import { Module } from '@nestjs/common';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';
import { GitSource } from './sources/git.source';
import { TimetrackingSource } from './sources/timetracking.source';
import { MeetingsSource } from './sources/meetings.source';
import { JiraSource } from './sources/jira.source';
import { OpencliService } from '../opencli/opencli.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [JournalController],
  providers: [
    JournalService,
    GitSource,
    TimetrackingSource,
    MeetingsSource,
    JiraSource,
    OpencliService,
  ],
})
export class JournalModule {}

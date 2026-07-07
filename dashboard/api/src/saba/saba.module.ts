import { Module } from '@nestjs/common';
import { SabaController } from './saba.controller';
import { SabaService } from './saba.service';
import { OpencliService } from '../opencli/opencli.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [SabaController],
  providers: [SabaService, OpencliService],
})
export class SabaModule {}

import { Controller, Get, Query } from '@nestjs/common';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  list(@Query() q: AuditQueryDto) {
    return this.service.query(q);
  }
}

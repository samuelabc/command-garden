import { Body, Controller, Post } from '@nestjs/common';
import { ReportDto } from './timetracking.dto';
import { TimetrackingService } from './timetracking.service';

@Controller('timetracking')
export class TimetrackingController {
  constructor(private readonly service: TimetrackingService) {}

  @Post('report')
  report(@Body() dto: ReportDto) {
    return this.service.report(dto);
  }
}

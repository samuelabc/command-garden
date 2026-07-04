import { Body, Controller, Post } from '@nestjs/common';
import { GenerateJournalDto } from './journal.dto';
import { JournalService } from './journal.service';

@Controller('journal')
export class JournalController {
  constructor(private readonly service: JournalService) {}

  @Post('generate')
  generate(@Body() dto: GenerateJournalDto) {
    return this.service.generate(dto);
  }
}

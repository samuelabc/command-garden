import { Controller, Post } from '@nestjs/common';
import { SabaService } from './saba.service';

@Controller('saba')
export class SabaController {
  constructor(private readonly service: SabaService) {}

  @Post('pending-training')
  pendingTraining() {
    return this.service.pendingTraining();
  }
}

import { Body, Controller, Post } from '@nestjs/common';
import { RoomFreeBusyDto } from './teams.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  @Post('roomfreebusy')
  roomFreeBusy(@Body() dto: RoomFreeBusyDto) {
    return this.service.roomFreeBusy(dto);
  }
}

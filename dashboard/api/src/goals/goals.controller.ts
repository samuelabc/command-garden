import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { CreateGoalDto, GoalQueryDto } from './goal.dto';

@Controller('goals')
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Get()
  findByMonth(@Query() query: GoalQueryDto) {
    return this.service.findByMonth(query.month);
  }

  @Post()
  @HttpCode(200)
  upsert(@Body() dto: CreateGoalDto) {
    return this.service.upsert(dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const result = await this.service.remove(id);
    if (!result) throw new NotFoundException(`Goal ${id} not found`);
    return result;
  }
}

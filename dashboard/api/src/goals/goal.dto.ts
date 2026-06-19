import { IsNotEmpty, IsNumber, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGoalDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month: string;

  @IsString()
  @IsNotEmpty({ message: 'projectId must not be empty' })
  projectId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.5, { message: 'targetDays must be at least 0.5' })
  @Max(31, { message: 'targetDays must be at most 31' })
  targetDays: number;
}

export class GoalQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month: string;
}

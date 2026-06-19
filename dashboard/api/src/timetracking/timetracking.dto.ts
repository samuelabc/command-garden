import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  months?: number;
}

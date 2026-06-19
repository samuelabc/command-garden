import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AuditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit = 50;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset = 0;

  @IsOptional() @IsIn(['success', 'auth_required', 'empty', 'error'])
  status?: 'success' | 'auth_required' | 'empty' | 'error';

  @IsOptional() @IsString()
  command?: string;
}

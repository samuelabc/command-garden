import { IsString, Matches } from 'class-validator';

export class GenerateJournalDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: 'weekStart must be YYYY-MM-DD format',
  })
  weekStart: string;
}

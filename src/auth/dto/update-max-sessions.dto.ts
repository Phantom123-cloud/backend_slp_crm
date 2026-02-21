import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class UpdateMaxSessionsDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  maxSessions: number;
}

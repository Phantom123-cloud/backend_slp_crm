import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';

export class ExportAuditDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  entity?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['xlsx', 'csv'] })
  @IsIn(['xlsx', 'csv'])
  @IsOptional()
  format?: 'xlsx' | 'csv';

  @ApiPropertyOptional({ enum: ['page', 'all'] })
  @IsIn(['page', 'all'])
  @IsOptional()
  scope?: 'page' | 'all';

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  limit?: number;
}

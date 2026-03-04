import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsArray,
  IsEnum,
  IsUUID,
  IsInt,
  IsNumber,
  ValidateNested,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TripRole } from '@prisma/client';

export class CreatePresentationDto {
  @ApiProperty({ example: '2026-02-26' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:MM format' })
  time: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  typeId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  venueId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  coordinatorId?: string;
}

export class UpdatePresentationDto {
  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:MM format' })
  @IsOptional()
  time?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  typeId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  venueId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  coordinatorId?: string;
}

export class PresentationCrewMemberDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: TripRole })
  @IsEnum(TripRole)
  role: TripRole;
}

export class SetPresentationCrewDto {
  @ApiProperty({ type: [PresentationCrewMemberDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PresentationCrewMemberDto)
  crew: PresentationCrewMemberDto[];
}

export class SummaryRowDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  successApproach?: number | null;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  totalApproach?: number | null;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  refusalCount?: number | null;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  refusalValue?: number | null;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  rewriteCount?: number | null;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  rewriteValue?: number | null;
}

export class SaveSummaryDto {
  @ApiProperty({ type: [SummaryRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SummaryRowDto)
  rows: SummaryRowDto[];
}

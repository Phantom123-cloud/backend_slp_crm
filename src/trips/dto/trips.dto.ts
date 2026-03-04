import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TripRole, TripStatus } from '@prisma/client';

export class CreateTripDto {
  @ApiProperty({ example: 'AA' })
  @IsString()
  @IsNotEmpty()
  teamName: string;

  @ApiProperty({ example: '2026-02-26' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-03-10' })
  @IsDateString()
  endDate: string;
}

export class UpdateTripDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  teamName?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class UpdateTripStatusDto {
  @ApiProperty({ enum: TripStatus })
  @IsEnum(TripStatus)
  status: TripStatus;
}

export class CrewMemberDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: TripRole })
  @IsEnum(TripRole)
  role: TripRole;
}

export class SetTripCrewDto {
  @ApiProperty({ type: [CrewMemberDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrewMemberDto)
  crew: CrewMemberDto[];
}

export class UpdateCoordinatorDto {
  @ApiProperty()
  @IsUUID()
  coordinatorId: string;
}

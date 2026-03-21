import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// === Presentation Types ===

export class CreatePresentationTypeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdatePresentationTypeDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

// === Expense Types ===

export class CreateExpenseTypeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateExpenseTypeDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;
}

// === Venues ===

export class CreateVenueDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  venueName: string;
}

export class UpdateVenueDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  venueName?: string;
}

// === Bank DTOs ===

export class CreateBankDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateBankDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum WarehouseTypeDto {
  CENTRAL = 'CENTRAL',
  PERSONAL = 'PERSONAL',
}

export enum TransactionTypeDto {
  INCOMING = 'INCOMING',
  SALE = 'SALE',
  GIFT = 'GIFT',
  CONTRACT = 'CONTRACT',
  WRITE_OFF = 'WRITE_OFF',
  TRANSFER = 'TRANSFER',
}

export class CreateWarehouseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({ enum: WarehouseTypeDto })
  @IsEnum(WarehouseTypeDto)
  type: WarehouseTypeDto;

  @ApiProperty()
  @IsString()
  ownerId: string;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class TransactionItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export enum IncomeSourceDto {
  SUPPLIER = 'SUPPLIER',
  SPV = 'SPV',
}

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionTypeDto })
  @IsEnum(TransactionTypeDto)
  type: TransactionTypeDto;

  @ApiProperty({ type: [TransactionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items: TransactionItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toWarehouseId?: string;

  @ApiPropertyOptional({ enum: IncomeSourceDto })
  @IsOptional()
  @IsEnum(IncomeSourceDto)
  source?: IncomeSourceDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateTransactionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ enum: IncomeSourceDto })
  @IsOptional()
  @IsEnum(IncomeSourceDto)
  source?: IncomeSourceDto;
}

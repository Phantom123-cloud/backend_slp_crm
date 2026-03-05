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
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ enum: WarehouseTypeDto })
  @IsEnum(WarehouseTypeDto)
  type: WarehouseTypeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

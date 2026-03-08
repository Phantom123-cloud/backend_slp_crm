import { IsString, IsOptional, IsNumber, IsBoolean, IsPositive, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ==================== WALLET ====================

export class CreateWalletDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerId?: string;
}

export class UpdateWalletDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerId?: string;
}

// ==================== TRANSACTIONS ====================

export class IncomeDto {
  @ApiProperty() @IsString() currency: string;
  @ApiProperty() @IsNumber() @IsPositive() amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() expenseTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  /** URL-ы загруженных изображений (до 15) */
  @ApiPropertyOptional({ type: [String] }) @IsOptional() images?: string[];
}

export class TransferDto {
  @ApiProperty() @IsString() toWalletId: string;
  @ApiProperty() @IsString() currency: string;
  @ApiProperty() @IsNumber() @IsPositive() amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() images?: string[];
}

export class UpdateTransactionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  /** null — снять тип расхода, string — установить */
  @ApiPropertyOptional() @IsOptional() expenseTypeId?: string | null;
  /** Полная замена списка изображений (URL-ы). Если не передаётся — фото не меняются */
  @ApiPropertyOptional({ type: [String] }) @IsOptional() images?: string[];
}

export class ConversionDto {
  @ApiProperty() @IsString() fromCurrency: string;
  @ApiProperty() @IsNumber() @IsPositive() fromAmount: number;
  @ApiProperty() @IsString() toCurrency: string;
  @ApiProperty() @IsNumber() @IsPositive() toAmount: number;
  /** Курс обмена */
  @ApiProperty() @IsNumber() @IsPositive() rate: number;
  /** true — пользовательский курс, false — курс из внешней библиотеки */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCustomRate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() images?: string[];
}

import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsDateString, IsArray, ValidateNested, IsBoolean, Min, IsObject, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentTypeDto {
  CASH = 'CASH',
  CREDIT = 'CREDIT',
  COMPANY = 'COMPANY',
  MIXED = 'MIXED',
  TERMINAL = 'TERMINAL',
  RESERVATION = 'RESERVATION',
}

export enum SaleTypeDto {
  RAFFLE = 'RAFFLE',
  HOURLY = 'HOURLY',
}

export class ContractPhoneDto {
  @IsString()
  @IsNotEmpty()
  countryCode: string;

  @IsString()
  @IsNotEmpty()
  number: string;
}

export class PaymentScheduleItemDto {
  @IsDateString()
  date: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;
}

export enum ContractItemTypeDto {
  SALE = 'SALE',
  GIFT = 'GIFT',
}

export class ContractItemInputDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsEnum(ContractItemTypeDto)
  type: ContractItemTypeDto;
}

export class UpdateContractItemDto {
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsString()
  @IsOptional()
  returnWarehouseId?: string; // если склад выезда неактивен
}

export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  clientName: string;

  @IsDateString()
  contractDate: string;

  @IsString()
  @IsOptional()
  companyId?: string;

  @IsEnum(PaymentTypeDto)
  paymentType: PaymentTypeDto;

  @IsEnum(SaleTypeDto)
  @IsOptional()
  saleType?: SaleTypeDto;

  @IsString()
  @IsNotEmpty()
  presentationId: string;

  @IsString()
  @IsNotEmpty()
  tripId: string;

  @IsString()
  @IsOptional()
  speakerId?: string;

  @IsString()
  @IsNotEmpty()
  signedById: string;

  @IsNumber()
  @Min(0)
  totalAmount: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  advanceCash?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  advanceTerminal?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  advanceBank?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  installmentMonths?: number;

  @IsDateString()
  @IsOptional()
  firstPaymentDate?: string;

  @IsString()
  @IsOptional()
  registrationAddress?: string;

  @IsString()
  @IsOptional()
  actualAddress?: string;

  @IsArray()
  @IsOptional()
  bankIds?: string[];

  @IsObject()
  @IsOptional()
  bankAdvances?: Record<string, number>;

  @IsObject()
  @IsOptional()
  bankConditions?: Record<string, { conditionId?: string; conditionName: string; conditionRate: number }>;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ContractPhoneDto)
  phones?: ContractPhoneDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PaymentScheduleItemDto)
  paymentSchedule?: PaymentScheduleItemDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ContractItemInputDto)
  items?: ContractItemInputDto[];
}

// DTO для оформления возврата (обнуление авансов)
export class RefundContractDto {
  @IsIn(['REFUND', 'PARTIAL_REFUND'])
  paymentStatus: 'REFUND' | 'PARTIAL_REFUND';

  @IsNumber()
  @IsOptional()
  @Min(0)
  advanceCash?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  advanceTerminal?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  advanceBank?: number;

  @IsObject()
  @IsOptional()
  bankAdvances?: Record<string, number>;

  @IsNumber()
  @IsOptional()
  @Min(0)
  amountAfterRefund?: number;
}

export class AddContractItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsEnum(ContractItemTypeDto)
  type: ContractItemTypeDto;

  @IsString()
  @IsOptional()
  sourceWarehouseId?: string; // если склад выезда закрыт — берём отсюда
}

export class UpdateContractDto {
  @IsString()
  @IsOptional()
  clientName?: string;

  @IsDateString()
  @IsOptional()
  contractDate?: string;

  @IsString()
  @IsOptional()
  companyId?: string;

  @IsEnum(PaymentTypeDto)
  @IsOptional()
  paymentType?: PaymentTypeDto;

  @IsEnum(SaleTypeDto)
  @IsOptional()
  saleType?: SaleTypeDto;

  @IsString()
  @IsOptional()
  speakerId?: string;

  @IsString()
  @IsOptional()
  signedById?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  totalAmount?: number;

  @IsNumber()
  @IsOptional()
  advanceCash?: number;

  @IsNumber()
  @IsOptional()
  advanceTerminal?: number;

  @IsNumber()
  @IsOptional()
  advanceBank?: number;

  @IsNumber()
  @IsOptional()
  installmentMonths?: number;

  @IsDateString()
  @IsOptional()
  firstPaymentDate?: string;

  @IsString()
  @IsOptional()
  registrationAddress?: string;

  @IsString()
  @IsOptional()
  actualAddress?: string;

  @IsArray()
  @IsOptional()
  bankIds?: string[];

  @IsObject()
  @IsOptional()
  bankAdvances?: Record<string, number>;

  @IsObject()
  @IsOptional()
  bankConditions?: Record<string, { conditionId?: string; conditionName: string; conditionRate: number }>;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ContractPhoneDto)
  phones?: ContractPhoneDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PaymentScheduleItemDto)
  paymentSchedule?: PaymentScheduleItemDto[];
}

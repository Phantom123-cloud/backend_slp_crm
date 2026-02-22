import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean,
  IsArray, IsNumber, IsEnum, IsDateString, MinLength,
  MaxLength, Min, Max,
} from 'class-validator';
import { ContactType, LanguageLevel } from '@prisma/client';

// === Регистрация (создание) юзера ===
export class CreateUserDto {
  @ApiProperty({ example: 'user@slp.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Иван' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Иванов' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ example: 'Иванович' })
  @IsString()
  @IsOptional()
  middleName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  roleId?: string;
}

// === Обновление профиля ===
export class UpdateUserProfileDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tradeCode?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  firstTripDate?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isCoordinator?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  coordinatorId?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isMarried?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  hasChildren?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  hasPassport?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  hasDriverLicense?: boolean;

  @ApiPropertyOptional({ example: 2.5 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(50)
  drivingExperience?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  passportNumber?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  registrationAddress?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  livingAddress?: string;
}

// === Контакт ===
export class AddContactDto {
  @ApiProperty({ enum: ContactType })
  @IsEnum(ContactType)
  type: ContactType;

  @ApiProperty({ example: '+998' })
  @IsString()
  @IsNotEmpty()
  countryCode: string;

  @ApiProperty({ example: '901234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;
}

// === Язык ===
export class AddLanguageDto {
  @ApiProperty({ example: 'Русский' })
  @IsString()
  @IsNotEmpty()
  language: string;

  @ApiProperty({ enum: LanguageLevel })
  @IsEnum(LanguageLevel)
  level: LanguageLevel;
}

// === Гражданство ===
export class AddCitizenshipDto {
  @ApiProperty({ type: [String], example: ['Узбекистан', 'Россия'] })
  @IsArray()
  @IsString({ each: true })
  countries: string[];
}

// === Экспорт пользователей ===
export class ExportUsersDto {
  @ApiProperty({ type: [String], example: ['email', 'lastName', 'firstName'] })
  @IsArray()
  @IsString({ each: true })
  fields: string[];

  @ApiPropertyOptional({ enum: ['xlsx', 'csv'], default: 'xlsx' })
  @IsString()
  @IsOptional()
  format?: 'xlsx' | 'csv';

  @ApiPropertyOptional({ enum: ['page', 'all'], default: 'all' })
  @IsString()
  @IsOptional()
  scope?: 'page' | 'all';

  @ApiPropertyOptional({ enum: ['all', 'active', 'blocked', 'online', 'offline'] })
  @IsString()
  @IsOptional()
  filter?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  limit?: number;
}

// === Смена email/пароля ===
export class UpdateCredentialsDto {
  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  roleId?: string;
}

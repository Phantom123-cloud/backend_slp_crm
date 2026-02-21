import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

// === Permission ===
export class CreatePermissionDto {
  @ApiProperty({ example: 'Создание пользователей' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'users.create' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ example: 'users' })
  @IsString()
  @IsNotEmpty()
  group: string;

  @ApiPropertyOptional({ example: 'Создание пользователей' })
  @IsString()
  @IsOptional()
  description?: string;
}

// === Role ===
export class CreateRoleDto {
  @ApiProperty({ example: 'Администратор' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Полный доступ ко всему' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['perm-uuid-1', 'perm-uuid-2'] })
  @IsArray()
  @IsOptional()
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Администратор' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Полный доступ ко всему' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  permissionIds?: string[];
}

import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@slp.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;

  @ApiProperty({ example: false, required: false, description: 'Принудительно завершить все старые сессии и войти' })
  @IsBoolean()
  @IsOptional()
  forceLogin?: boolean;
}

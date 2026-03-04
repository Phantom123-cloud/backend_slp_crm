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
}

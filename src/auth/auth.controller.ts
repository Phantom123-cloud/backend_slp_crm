import { Controller, Post, Get, Patch, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { UpdateMaxSessionsDto } from './dto/update-max-sessions.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Вход в систему' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Текущий пользователь + права' })
  me(@CurrentUser('id') userId: string) {
    return this.authService.me(userId);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Обновить access token' })
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Выход из системы' })
  logout(
    @Body('refreshToken') refreshToken: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.authService.logout(refreshToken, userId);
  }

  @Patch('my-sessions')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('session.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Изменить свой лимит сессий' })
  updateMyMaxSessions(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMaxSessionsDto,
  ) {
    return this.authService.updateMyMaxSessions(userId, dto.maxSessions);
  }
}

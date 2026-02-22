import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req, Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateUserDto, UpdateUserProfileDto, AddContactDto,
  AddLanguageDto, AddCitizenshipDto, UpdateCredentialsDto,
  ExportUsersDto,
} from './dto/users.dto';
import { UpdateMaxSessionsDto } from '../auth/dto/update-max-sessions.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private authService: AuthService,
  ) {}

  // === CRUD ===

  @Post()
  @RequirePermissions('users.create')
  @ApiOperation({ summary: 'Создать пользователя' })
  create(@Body() dto: CreateUserDto, @CurrentUser('id') adminId: string, @Req() req: Request) {
    return this.usersService.create(dto, adminId, req.ip);
  }

  @Get()
  @RequirePermissions('users.view')
  @ApiOperation({ summary: 'Список пользователей' })
  @ApiQuery({ name: 'filter', required: false, enum: ['all', 'active', 'blocked', 'online', 'offline'] })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'detailed', required: false, enum: ['true', 'false'] })
  findAll(
    @Query('filter') filter?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('detailed') detailed?: string,
  ) {
    return this.usersService.findAll({
      filter: filter as any,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      detailed: detailed === 'true',
    });
  }

  @Get('coordinators')
  @RequirePermissions('users.view')
  @ApiOperation({ summary: 'Список координаторов' })
  getCoordinators() {
    return this.usersService.getCoordinators();
  }

  @Post('export')
  @RequirePermissions('users.view')
  @ApiOperation({ summary: 'Экспорт пользователей' })
  async exportUsers(@Body() dto: ExportUsersDto, @Res() res: Response) {
    const buffer = await this.usersService.exportUsers(dto);
    const isXlsx = (dto.format || 'xlsx') === 'xlsx';
    const ext = isXlsx ? 'xlsx' : 'csv';
    const mime = isXlsx
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8';

    res.set({
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="users.${ext}"`,
    });
    res.send(buffer);
  }

  @Patch(':id/max-sessions')
  @RequirePermissions('session.manage')
  @ApiOperation({ summary: 'Изменить лимит сессий пользователя' })
  updateMaxSessions(
    @Param('id') id: string,
    @Body() dto: UpdateMaxSessionsDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.usersService.updateMaxSessions(id, dto.maxSessions, adminId);
  }

  @Get(':id')
  @RequirePermissions('users.view')
  @ApiOperation({ summary: 'Профиль пользователя' })
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id/profile')
  @RequirePermissions('users.edit_profile')
  @ApiOperation({ summary: 'Обновить профиль' })
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateUserProfileDto,
    @CurrentUser('id') adminId: string,
    @Req() req: Request,
  ) {
    return this.usersService.updateProfile(id, dto, adminId, req.ip);
  }

  @Patch(':id/credentials')
  @RequirePermissions('users.edit_settings')
  @ApiOperation({ summary: 'Изменить email/пароль/роль' })
  updateCredentials(
    @Param('id') id: string,
    @Body() dto: UpdateCredentialsDto,
    @CurrentUser('id') adminId: string,
    @Req() req: Request,
  ) {
    return this.usersService.updateCredentials(id, dto, adminId, req.ip);
  }

  // === Контакты ===

  @Post(':id/contacts')
  @RequirePermissions('users.edit_profile')
  @ApiOperation({ summary: 'Добавить контакт' })
  addContact(@Param('id') id: string, @Body() dto: AddContactDto, @CurrentUser('id') adminId: string) {
    return this.usersService.addContact(id, dto, adminId);
  }

  @Delete('contacts/:contactId')
  @RequirePermissions('users.edit_profile')
  @ApiOperation({ summary: 'Удалить контакт' })
  removeContact(@Param('contactId') contactId: string, @CurrentUser('id') adminId: string) {
    return this.usersService.removeContact(contactId, adminId);
  }

  // === Языки ===

  @Post(':id/languages')
  @RequirePermissions('users.edit_profile')
  @ApiOperation({ summary: 'Добавить язык' })
  addLanguage(@Param('id') id: string, @Body() dto: AddLanguageDto, @CurrentUser('id') adminId: string) {
    return this.usersService.addLanguage(id, dto, adminId);
  }

  @Delete('languages/:languageId')
  @RequirePermissions('users.edit_profile')
  @ApiOperation({ summary: 'Удалить язык' })
  removeLanguage(@Param('languageId') languageId: string, @CurrentUser('id') adminId: string) {
    return this.usersService.removeLanguage(languageId, adminId);
  }

  // === Гражданства ===

  @Patch(':id/citizenships')
  @RequirePermissions('users.edit_profile')
  @ApiOperation({ summary: 'Обновить гражданства' })
  setCitizenships(@Param('id') id: string, @Body() dto: AddCitizenshipDto, @CurrentUser('id') adminId: string) {
    return this.usersService.setCitizenships(id, dto, adminId);
  }

  // === Действия над юзером ===

  @Post(':id/force-logout')
  @RequirePermissions('users.force_logout')
  @ApiOperation({ summary: 'Принудительный выход' })
  forceLogout(@Param('id') id: string, @CurrentUser('id') adminId: string, @Req() req: Request) {
    return this.authService.forceLogout(id, adminId, req.ip);
  }

  @Post(':id/block')
  @RequirePermissions('users.block')
  @ApiOperation({ summary: 'Заблокировать пользователя' })
  block(@Param('id') id: string, @CurrentUser('id') adminId: string, @Req() req: Request) {
    return this.authService.blockUser(id, adminId, req.ip);
  }

  @Post(':id/unblock')
  @RequirePermissions('users.block')
  @ApiOperation({ summary: 'Разблокировать пользователя' })
  unblock(@Param('id') id: string, @CurrentUser('id') adminId: string, @Req() req: Request) {
    return this.authService.unblockUser(id, adminId, req.ip);
  }
}

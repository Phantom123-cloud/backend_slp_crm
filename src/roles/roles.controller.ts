import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions, RequireAnyPermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePermissionDto, CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private rolesService: RolesService) {}

  // === Permissions ===

  @Post('permissions')
  @RequirePermissions('roles.create')
  @ApiOperation({ summary: 'Создать право' })
  createPermission(@Body() dto: CreatePermissionDto, @CurrentUser('id') userId: string) {
    return this.rolesService.createPermission(dto, userId);
  }

  @Get('permissions')
  @RequirePermissions('roles.view')
  @ApiOperation({ summary: 'Все права' })
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  // === Roles ===

  @Post()
  @RequirePermissions('roles.create')
  @ApiOperation({ summary: 'Создать роль' })
  createRole(@Body() dto: CreateRoleDto, @CurrentUser('id') userId: string) {
    return this.rolesService.createRole(dto, userId);
  }

  @Get()
  @RequirePermissions('roles.view')
  @ApiOperation({ summary: 'Все роли' })
  findAllRoles() {
    return this.rolesService.findAllRoles();
  }

  @Get('list')
  @RequireAnyPermission('roles.view', 'users.edit_settings')
  @ApiOperation({ summary: 'Список ролей (id + name) для выпадающих списков' })
  findRolesList() {
    return this.rolesService.findRolesList();
  }

  @Get(':id')
  @RequirePermissions('roles.view')
  @ApiOperation({ summary: 'Роль по ID' })
  findRoleById(@Param('id') id: string) {
    return this.rolesService.findRoleById(id);
  }

  @Patch(':id')
  @RequirePermissions('roles.edit')
  @ApiOperation({ summary: 'Обновить роль' })
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser('id') userId: string) {
    return this.rolesService.updateRole(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions('roles.delete')
  @ApiOperation({ summary: 'Удалить роль' })
  deleteRole(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.rolesService.deleteRole(id, userId);
  }
}

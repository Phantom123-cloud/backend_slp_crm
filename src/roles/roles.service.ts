import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePermissionDto, CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==================== Permissions ====================

  async createPermission(dto: CreatePermissionDto, userId: string) {
    const exists = await this.prisma.permission.findUnique({ where: { slug: dto.slug } });
    if (exists) throw new ConflictException('errors.permissionSlugExists');

    const permission = await this.prisma.permission.create({ data: dto });

    await this.auditService.log({
      userId,
      action: 'permission.created',
      entity: 'permission',
      entityId: permission.id,
      details: dto,
    });

    return permission;
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ group: 'asc' }, { slug: 'asc' }],
    });
  }

  // ==================== Roles ====================

  async createRole(dto: CreateRoleDto, userId: string) {
    const exists = await this.prisma.role.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('errors.roleAlreadyExists');

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        permissions: dto.permissionIds
          ? { create: dto.permissionIds.map((id) => ({ permissionId: id })) }
          : undefined,
      },
      include: { permissions: { include: { permission: true } } },
    });

    await this.auditService.log({
      userId,
      action: 'role.created',
      entity: 'role',
      entityId: role.id,
      details: dto,
    });

    return role;
  }

  async findAllRoles() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /** Лёгкий список ролей (id + name + description) для выпадающих списков */
  async findRolesList() {
    return this.prisma.role.findMany({
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
  }

  async findRoleById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('errors.roleNotFound');
    return role;
  }

  async updateRole(id: string, dto: UpdateRoleDto, userId: string) {
    await this.findRoleById(id);

    if (dto.permissionIds) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await this.prisma.rolePermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      });
    }

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: { permissions: { include: { permission: true } } },
    });

    await this.auditService.log({
      userId,
      action: 'role.updated',
      entity: 'role',
      entityId: id,
      details: dto,
    });

    return role;
  }

  async deleteRole(id: string, userId: string) {
    await this.findRoleById(id);

    // Проверяем, не привязана ли роль к пользователям
    const usersWithRole = await this.prisma.user.count({ where: { roleId: id } });
    if (usersWithRole > 0) {
      throw new ConflictException('errors.roleInUse');
    }

    await this.prisma.role.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'role.deleted',
      entity: 'role',
      entityId: id,
    });
  }
}

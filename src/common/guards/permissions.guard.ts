import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ANY_PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const anyPermissions = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Если на роуте нет ни одного декоратора — пропускаем
    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!anyPermissions || anyPermissions.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) return false;

    const userPermissions = await this.getUserPermissions(userId);

    // @RequirePermissions — все права обязательны (AND)
    if (requiredPermissions && requiredPermissions.length > 0) {
      return requiredPermissions.every((p) => userPermissions.includes(p));
    }

    // @RequireAnyPermission — достаточно одного (OR)
    if (anyPermissions && anyPermissions.length > 0) {
      return anyPermissions.some((p) => userPermissions.includes(p));
    }

    return true;
  }

  private async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || !user.role) return [];

    return user.role.permissions.map((rp) => rp.permission.slug);
  }
}

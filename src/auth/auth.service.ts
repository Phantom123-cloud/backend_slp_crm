import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {}

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('errors.invalidCredentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('errors.accountBlocked');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('errors.invalidCredentials');
    }

    // Проверяем лимит одновременных сессий
    const activeSessions = await this.prisma.session.count({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
    });
    if (activeSessions >= user.maxSessions) {
      if (dto.forceLogin) {
        // Принудительный вход — удаляем все старые сессии
        await this.prisma.session.deleteMany({ where: { userId: user.id } });
      } else {
        throw new ForbiddenException('errors.sessionLimit');
      }
    }

    // Генерируем токены
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      dto.rememberMe,
    );

    // Сохраняем сессию
    const refreshExpiresIn = dto.rememberMe
      ? this.configService.get('JWT_REFRESH_EXPIRES_LONG')
      : this.configService.get('JWT_REFRESH_EXPIRES_SHORT');

    const expiresAt = this.calculateExpiry(refreshExpiresIn);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        rememberMe: dto.rememberMe || false,
        ip,
        userAgent,
        expiresAt,
      },
    });

    // Ставим онлайн
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isOnline: true },
    });

    await this.auditService.log({
      userId: user.id,
      action: 'auth.login',
      entity: 'session',
      ip,
    });

    // Получаем permissions юзера
    const permissions = await this.getUserPermissions(user.id);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      permissions,
    };
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('errors.sessionExpired');
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException('errors.accountBlocked');
    }

    const tokens = await this.generateTokens(
      session.user.id,
      session.user.email,
      session.rememberMe,
    );

    // Обновляем refresh token в сессии
    const refreshExpiresIn = session.rememberMe
      ? this.configService.get('JWT_REFRESH_EXPIRES_LONG')
      : this.configService.get('JWT_REFRESH_EXPIRES_SHORT');

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: tokens.refreshToken,
        expiresAt: this.calculateExpiry(refreshExpiresIn),
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(refreshToken: string, userId: string) {
    await this.prisma.session.deleteMany({
      where: { refreshToken, userId },
    });

    const remainingSessions = await this.prisma.session.count({
      where: { userId },
    });

    if (remainingSessions === 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isOnline: false },
      });
    }

    await this.auditService.log({
      userId,
      action: 'auth.logout',
      entity: 'session',
    });
  }

  async forceLogout(targetUserId: string, adminId: string, ip?: string) {
    if (targetUserId === adminId) {
      throw new BadRequestException('errors.cannotForceLogoutSelf');
    }

    await this.prisma.session.deleteMany({
      where: { userId: targetUserId },
    });

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isOnline: false },
    });

    await this.auditService.log({
      userId: adminId,
      action: 'auth.force_logout',
      entity: 'user',
      entityId: targetUserId,
      ip,
    });
  }

  async blockUser(targetUserId: string, adminId: string, ip?: string) {
    if (targetUserId === adminId) {
      throw new BadRequestException('errors.cannotBlockSelf');
    }

    await this.prisma.session.deleteMany({
      where: { userId: targetUserId },
    });

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false, isOnline: false },
    });

    await this.auditService.log({
      userId: adminId,
      action: 'user.blocked',
      entity: 'user',
      entityId: targetUserId,
      ip,
    });
  }

  async unblockUser(targetUserId: string, adminId: string, ip?: string) {
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: true },
    });

    await this.auditService.log({
      userId: adminId,
      action: 'user.unblocked',
      entity: 'user',
      entityId: targetUserId,
      ip,
    });
  }

  // /auth/me — проверка текущей сессии + возврат прав + heartbeat
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('errors.accountDeactivated');
    }

    // Проверяем наличие активных сессий (force logout удаляет все сессии)
    const sessionCount = await this.prisma.session.count({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    if (sessionCount === 0) {
      throw new UnauthorizedException('errors.sessionTerminated');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeen: new Date(), isOnline: true },
    });

    const permissions = await this.getUserPermissions(userId);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      permissions,
    };
  }

  // Получить все permissions юзера (User -> Role -> Permissions)
  async getUserPermissions(userId: string): Promise<string[]> {
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

  private async generateTokens(
    userId: string,
    email: string,
    rememberMe?: boolean,
  ) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES'),
    });

    const refreshExpiresIn = rememberMe
      ? this.configService.get('JWT_REFRESH_EXPIRES_LONG')
      : this.configService.get('JWT_REFRESH_EXPIRES_SHORT');

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: refreshExpiresIn,
    });

    return { accessToken, refreshToken };
  }

  async updateMyMaxSessions(userId: string, maxSessions: number) {
    // Проверяем, не превышает ли текущее кол-во активных сессий новый лимит
    const activeSessions = await this.prisma.session.count({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    if (activeSessions > maxSessions) {
      throw new BadRequestException('errors.sessionLimitTooLow');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { maxSessions },
    });

    await this.auditService.log({
      userId,
      action: 'session.max_updated',
      entity: 'user',
      entityId: userId,
      details: { maxSessions },
    });

    return { maxSessions };
  }

  private calculateExpiry(duration: string): Date {
    const now = new Date();
    const num = parseInt(duration);
    const unit = duration.replace(/\d/g, '');

    switch (unit) {
      case 'd':
        now.setDate(now.getDate() + num);
        break;
      case 'h':
        now.setHours(now.getHours() + num);
        break;
      case 'm':
        now.setMinutes(now.getMinutes() + num);
        break;
      default:
        now.setDate(now.getDate() + 1);
    }
    return now;
  }
}

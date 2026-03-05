import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateTripDto,
  UpdateTripDto,
  UpdateTripStatusDto,
  SetTripCrewDto,
  UpdateCoordinatorDto,
} from './dto/trips.dto';
import { TripStatus, TransferStatus } from '@prisma/client';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==================== Helpers ====================

  private generateTripName(teamName: string, startDate: Date): string {
    const yy = String(startDate.getFullYear()).slice(-2);
    const mm = String(startDate.getMonth() + 1).padStart(2, '0');
    const dd = String(startDate.getDate()).padStart(2, '0');
    return `${teamName}${yy}${mm}${dd}`;
  }

  /** Вычисляет эффективный статус выезда на основе дат.
   *  CLOSED — всегда закрыт (ручная операция).
   *  ACTIVE  — сегодня попадает в диапазон [startDate, endDate] и не закрыт.
   *  PLANNED — всё остальное (ещё не начался или уже завершён, но не закрыт).
   */
  private computeStatus(trip: {
    status: string;
    startDate: Date;
    endDate: Date;
  }): string {
    if (trip.status === 'CLOSED') return 'CLOSED';
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    if (start <= todayEnd && end >= todayStart) return 'ACTIVE';
    return 'PLANNED';
  }

  private tripInclude() {
    return {
      coordinator: {
        select: { id: true, firstName: true, lastName: true, middleName: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true, middleName: true },
      },
      crew: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tradeCode: true,
            },
          },
        },
        orderBy: { role: 'asc' as const },
      },
      presentations: {
        include: {
          type: true,
          venue: true,
          coordinator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
            },
          },
          crew: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  middleName: true,
                  tradeCode: true,
                },
              },
            },
          },
        },
        orderBy: [{ date: 'asc' as const }, { number: 'asc' as const }],
      },
      warehouse: true,
      wallet: true,
    };
  }

  // ==================== CRUD ====================

  async findAll(filter?: string, userId?: string, userPermissions?: string[]) {
    const hasViewAll = userPermissions?.includes('trips.view-all');
    const hasViewPerson = userPermissions?.includes('trips.view-person');
    const isAdmin = userPermissions?.includes('trips.admin');

    // Без хотя бы одного права на просмотр — ничего не показываем
    if (!hasViewAll && !hasViewPerson) return [];

    // Границы «сегодня» для сравнения с датами
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    const where: any = {};

    // Фильтр по вычисляемому статусу через условия на датах
    if (filter === 'active') {
      // Не закрыт + сегодня попадает в [startDate, endDate]
      where.status = { not: TripStatus.CLOSED };
      where.startDate = { lte: todayEnd };
      where.endDate = { gte: todayStart };
    } else if (filter === 'closed') {
      where.status = TripStatus.CLOSED;
    } else if (filter === 'planned') {
      // Не закрыт + ещё не начался
      where.status = { not: TripStatus.CLOSED };
      where.startDate = { gt: todayEnd };
    }
    // 'all' — без дополнительных условий

    // Если у пользователя нет trips.view-all — показываем только «его» выезды
    if (!hasViewAll && userId) {
      where.OR = [
        { createdById: userId },
        { coordinatorId: userId },
        { crew: { some: { userId } } },
      ];
    }

    // Скрываем закрытые от не-администраторов (кроме явного фильтра 'closed')
    if (!isAdmin && filter !== 'closed') {
      if (!where.status) {
        where.status = { not: TripStatus.CLOSED };
      }
    }

    const trips = await this.prisma.trip.findMany({
      where,
      include: {
        coordinator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        },
        crew: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                tradeCode: true,
              },
            },
          },
          orderBy: { role: 'asc' as const },
        },
        _count: { select: { presentations: true, crew: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    // Вычисляем эффективный статус для каждого выезда
    return trips.map((t) => ({ ...t, status: this.computeStatus(t) }));
  }

  /** Внутренний метод — возвращает «сырой» статус из БД (для проверок внутри сервиса). */
  private async getTrip(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: this.tripInclude(),
    });
    if (!trip) throw new NotFoundException('errors.tripNotFound');
    return trip;
  }

  /** Публичный метод — возвращает выезд с вычисленным статусом. */
  async findById(id: string) {
    const trip = await this.getTrip(id);
    return { ...trip, status: this.computeStatus(trip) };
  }

  async create(dto: CreateTripDto, userId: string) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate <= startDate) {
      throw new BadRequestException('errors.tripEndBeforeStart');
    }

    const name = this.generateTripName(dto.teamName, startDate);

    // Create trip + warehouse + wallet in transaction
    const trip = await this.prisma.$transaction(async (tx) => {
      const newTrip = await tx.trip.create({
        data: {
          name,
          teamName: dto.teamName,
          startDate,
          endDate,
          createdById: userId,
        },
      });

      await tx.warehouse.create({
        data: {
          name,
          type: 'TRIP',
          tripId: newTrip.id,
          createdById: userId,
        },
      });
      await tx.wallet.create({ data: { tripId: newTrip.id } });

      return newTrip;
    });

    await this.auditService.log({
      userId,
      action: 'trip.created',
      entity: 'trip',
      entityId: trip.id,
      details: {
        name,
        teamName: dto.teamName,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    });

    return this.findById(trip.id);
  }

  async update(id: string, dto: UpdateTripDto, userId: string) {
    const trip = await this.getTrip(id);

    const startDate = dto.startDate ? new Date(dto.startDate) : trip.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : trip.endDate;

    if (endDate <= startDate) {
      throw new BadRequestException('errors.tripEndBeforeStart');
    }

    // Check presentations are within new date range
    if (dto.startDate || dto.endDate) {
      const outOfRange = await this.prisma.presentation.count({
        where: {
          tripId: id,
          OR: [{ date: { lt: startDate } }, { date: { gt: endDate } }],
        },
      });
      if (outOfRange > 0) {
        throw new BadRequestException('errors.tripDatesConflict');
      }
    }

    const teamName = dto.teamName || trip.teamName;
    const name = this.generateTripName(teamName, startDate);

    const updated = await this.prisma.trip.update({
      where: { id },
      data: {
        name,
        teamName,
        startDate,
        endDate,
      },
      include: this.tripInclude(),
    });

    await this.auditService.log({
      userId,
      action: 'trip.updated',
      entity: 'trip',
      entityId: id,
      details: dto,
    });

    return { ...updated, status: this.computeStatus(updated) };
  }

  async updateStatus(id: string, dto: UpdateTripStatusDto, userId: string) {
    await this.getTrip(id);

    // When closing a trip, validate warehouse is clear
    if (dto.status === 'CLOSED') {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { tripId: id },
        include: {
          stock: true,
        },
      });

      if (warehouse) {
        // Check for non-zero stock
        const nonZeroStock = warehouse.stock.filter(
          (s) => Number(s.quantity) !== 0,
        );
        if (nonZeroStock.length > 0) {
          throw new BadRequestException('errors.tripWarehouseNotEmpty');
        }

        // Check for pending transfers (either as sender or receiver)
        const pendingTransfers = await this.prisma.transaction.findMany({
          where: {
            transferStatus: TransferStatus.PENDING,
            OR: [
              { fromWarehouseId: warehouse.id },
              { toWarehouseId: warehouse.id },
            ],
          },
        });
        if (pendingTransfers.length > 0) {
          throw new BadRequestException('errors.tripWarehousePendingTransfers');
        }
      }
    }

    const updated = await this.prisma.trip.update({
      where: { id },
      data: { status: dto.status },
      include: this.tripInclude(),
    });

    await this.auditService.log({
      userId,
      action: 'trip.statusChanged',
      entity: 'trip',
      entityId: id,
      details: { status: dto.status },
    });

    return { ...updated, status: this.computeStatus(updated) };
  }

  async delete(id: string, userId: string) {
    const trip = await this.getTrip(id);

    if (trip.presentations.length > 0) {
      throw new ConflictException('errors.tripHasPresentations');
    }

    await this.prisma.trip.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'trip.deleted',
      entity: 'trip',
      entityId: id,
    });
  }

  // ==================== Crew ====================

  async getCrew(tripId: string) {
    await this.getTrip(tripId);
    return this.prisma.tripCrew.findMany({
      where: { tripId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tradeCode: true,
            isCoordinator: true,
            coordinatorId: true,
          },
        },
      },
      orderBy: { role: 'asc' },
    });
  }

  private validateCrew(crew: { userId: string; role: string }[]) {
    const roles = crew.map((m) => m.role);

    // Дубликаты userId запрещены
    const userIds = crew.map((m) => m.userId);
    const uniqueUserIds = new Set(userIds);
    if (uniqueUserIds.size !== userIds.length) {
      throw new BadRequestException('errors.crewDuplicateUser');
    }

    // LEADER — строго 1 (обязателен)
    const leaderCount = roles.filter((r) => r === 'LEADER').length;
    if (leaderCount === 0)
      throw new BadRequestException('errors.crewNeedsLeader');
    if (leaderCount > 1) throw new BadRequestException('errors.crewOneLeader');

    // MV, GA, MV_GA — max 1 each
    const mvCount = roles.filter((r) => r === 'MV').length;
    const gaCount = roles.filter((r) => r === 'GA').length;
    const mvGaCount = roles.filter((r) => r === 'MV_GA').length;
    if (mvCount > 1) throw new BadRequestException('errors.crewOneMv');
    if (gaCount > 1) throw new BadRequestException('errors.crewOneGa');
    if (mvGaCount > 1) throw new BadRequestException('errors.crewOneMvGa');

    const hasMV = mvCount > 0;
    const hasGA = gaCount > 0;
    const hasMV_GA = mvGaCount > 0;
    const hasAnyMvGa = hasMV || hasGA || hasMV_GA;

    // Обязательно должен быть хотя бы один из MV/GA/MV_GA
    if (!hasAnyMvGa) {
      throw new BadRequestException('errors.crewNeedsMvGa');
    }

    // Запрещено все три одновременно
    if (hasMV && hasGA && hasMV_GA) {
      throw new BadRequestException('errors.crewMvGaConflict');
    }

    // MV один без GA или MV_GA — запрещено
    if (hasMV && !hasGA && !hasMV_GA) {
      throw new BadRequestException('errors.crewMvNeedsGa');
    }
    // GA один без MV или MV_GA — запрещено
    if (hasGA && !hasMV && !hasMV_GA) {
      throw new BadRequestException('errors.crewGaNeedsMv');
    }
  }

  async setCrew(tripId: string, dto: SetTripCrewDto, userId: string) {
    const trip = await this.getTrip(tripId);

    // Нельзя редактировать закрытый выезд
    if (trip.status === 'CLOSED') {
      throw new ConflictException('errors.tripIsClosed');
    }

    // Validate crew composition (всегда, даже пустой состав отклоняем)
    this.validateCrew(dto.crew);

    // Find the LEADER to auto-set coordinator
    const leader = dto.crew.find((m) => m.role === 'LEADER');
    let coordinatorId: string | null = null;

    if (leader) {
      // Get leader's coordinator from user profile
      const leaderUser = await this.prisma.user.findUnique({
        where: { id: leader.userId },
        select: { coordinatorId: true, isCoordinator: true },
      });
      // Если ведущий сам является координатором — он и есть координатор выезда
      // Иначе берём coordinatorId из его профиля
      if (leaderUser?.isCoordinator) {
        coordinatorId = leader.userId;
      } else {
        coordinatorId = leaderUser?.coordinatorId || null;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tripCrew.deleteMany({ where: { tripId } });
      if (dto.crew.length > 0) {
        await tx.tripCrew.createMany({
          data: dto.crew.map((m) => ({
            tripId,
            userId: m.userId,
            role: m.role,
          })),
        });
      }

      // Auto-set warehouse owner to MV (preferred) or MV_GA
      const mvMember =
        dto.crew.find((m) => m.role === 'MV') ||
        dto.crew.find((m) => m.role === 'MV_GA');
      if (mvMember) {
        await tx.warehouse.updateMany({
          where: { tripId, type: 'TRIP' },
          data: { ownerId: mvMember.userId },
        });
      }

      // Auto-set coordinator from leader's coordinator
      if (coordinatorId) {
        await tx.trip.update({
          where: { id: tripId },
          data: { coordinatorId },
        });
        // Cascade to presentations
        await tx.presentation.updateMany({
          where: { tripId },
          data: { coordinatorId },
        });
      }
    });

    await this.auditService.log({
      userId,
      action: 'trip.crewUpdated',
      entity: 'trip',
      entityId: tripId,
      details: { crew: dto.crew, coordinatorId },
    });

    return this.getCrew(tripId);
  }

  async updateCoordinator(
    tripId: string,
    dto: UpdateCoordinatorDto,
    userId: string,
  ) {
    await this.getTrip(tripId);

    // Update trip coordinator
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { coordinatorId: dto.coordinatorId },
    });

    // Cascade: update coordinator on all presentations of this trip
    await this.prisma.presentation.updateMany({
      where: { tripId },
      data: { coordinatorId: dto.coordinatorId },
    });

    await this.auditService.log({
      userId,
      action: 'trip.coordinatorChanged',
      entity: 'trip',
      entityId: tripId,
      details: { coordinatorId: dto.coordinatorId },
    });

    return this.findById(tripId);
  }

  // ==================== Users for crew selection ====================

  async getAvailableUsers() {
    // Users who have a coordinator OR are coordinators themselves
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ isCoordinator: true }, { coordinatorId: { not: null } }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tradeCode: true,
        isCoordinator: true,
        coordinatorId: true,
        coordinator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }
}

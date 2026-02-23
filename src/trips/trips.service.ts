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
import { TripStatus } from '@prisma/client';

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

  private tripInclude() {
    return {
      coordinator: { select: { id: true, firstName: true, lastName: true, middleName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, middleName: true } },
      crew: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, middleName: true, tradeCode: true } },
        },
        orderBy: { role: 'asc' as const },
      },
      presentations: {
        include: {
          type: true,
          venue: true,
          coordinator: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        },
        orderBy: [{ date: 'asc' as const }, { number: 'asc' as const }],
      },
      warehouse: true,
      wallet: true,
    };
  }

  // ==================== CRUD ====================

  async findAll(filter?: string, userId?: string, userPermissions?: string[]) {
    const hasViewAll = userPermissions?.includes('trips.view');

    const where: any = {};

    // Filter by status
    if (filter === 'active') where.status = TripStatus.ACTIVE;
    else if (filter === 'closed') where.status = TripStatus.CLOSED;
    else if (filter === 'planned') where.status = TripStatus.PLANNED;
    // 'all' — no filter

    // If user doesn't have trips.view, show only trips they're part of
    if (!hasViewAll && userId) {
      where.OR = [
        { createdById: userId },
        { coordinatorId: userId },
        { crew: { some: { userId } } },
      ];
    }

    // Hide closed trips for non-admin
    if (!userPermissions?.includes('trips.admin') && filter !== 'closed') {
      if (!where.status) {
        where.status = { not: TripStatus.CLOSED };
      }
    }

    return this.prisma.trip.findMany({
      where,
      include: {
        coordinator: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        _count: { select: { presentations: true, crew: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async findById(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: this.tripInclude(),
    });
    if (!trip) throw new NotFoundException('errors.tripNotFound');
    return trip;
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

      await tx.warehouse.create({ data: { tripId: newTrip.id } });
      await tx.wallet.create({ data: { tripId: newTrip.id } });

      return newTrip;
    });

    await this.auditService.log({
      userId,
      action: 'trip.created',
      entity: 'trip',
      entityId: trip.id,
      details: { name, teamName: dto.teamName, startDate: dto.startDate, endDate: dto.endDate },
    });

    return this.findById(trip.id);
  }

  async update(id: string, dto: UpdateTripDto, userId: string) {
    const trip = await this.findById(id);

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
          OR: [
            { date: { lt: startDate } },
            { date: { gt: endDate } },
          ],
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

    return updated;
  }

  async updateStatus(id: string, dto: UpdateTripStatusDto, userId: string) {
    await this.findById(id);

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

    return updated;
  }

  async delete(id: string, userId: string) {
    const trip = await this.findById(id);

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
    await this.findById(tripId);
    return this.prisma.tripCrew.findMany({
      where: { tripId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, middleName: true, tradeCode: true, isCoordinator: true, coordinatorId: true } },
      },
      orderBy: { role: 'asc' },
    });
  }

  private validateCrew(crew: { userId: string; role: string }[]) {
    const roles = crew.map((m) => m.role);

    // LEADER — strictly 1
    const leaderCount = roles.filter((r) => r === 'LEADER').length;
    if (leaderCount > 1) throw new BadRequestException('errors.crewOneLeader');

    // TRADER — max 20
    const traderCount = roles.filter((r) => r === 'TRADER').length;
    if (traderCount > 20) throw new BadRequestException('errors.crewMaxTraders');

    const hasMV = roles.includes('MV');
    const hasGA = roles.includes('GA');
    const hasMV_GA = roles.includes('MV_GA');

    // Valid: MV+GA, GA+MV_GA, MV+MV_GA, MV_GA alone
    // Forbidden: all three (MV + GA + MV_GA)
    if (hasMV && hasGA && hasMV_GA) {
      throw new BadRequestException('errors.crewMvGaConflict');
    }

    // Can't have only MV without GA or MV_GA
    if (hasMV && !hasGA && !hasMV_GA) {
      throw new BadRequestException('errors.crewMvNeedsGa');
    }
    // Can't have only GA without MV or MV_GA
    if (hasGA && !hasMV && !hasMV_GA) {
      throw new BadRequestException('errors.crewGaNeedsMv');
    }
  }

  async setCrew(tripId: string, dto: SetTripCrewDto, userId: string) {
    await this.findById(tripId);

    // Validate crew composition
    if (dto.crew.length > 0) {
      this.validateCrew(dto.crew);
    }

    // Find the LEADER to auto-set coordinator
    const leader = dto.crew.find((m) => m.role === 'LEADER');
    let coordinatorId: string | null = null;

    if (leader) {
      // Get leader's coordinator from user profile
      const leaderUser = await this.prisma.user.findUnique({
        where: { id: leader.userId },
        select: { coordinatorId: true },
      });
      coordinatorId = leaderUser?.coordinatorId || null;
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

  async updateCoordinator(tripId: string, dto: UpdateCoordinatorDto, userId: string) {
    await this.findById(tripId);

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
        OR: [
          { isCoordinator: true },
          { coordinatorId: { not: null } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tradeCode: true,
        isCoordinator: true,
        coordinatorId: true,
        coordinator: { select: { id: true, firstName: true, lastName: true, middleName: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }
}

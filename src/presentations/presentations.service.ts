import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreatePresentationDto,
  UpdatePresentationDto,
  SetPresentationCrewDto,
  SaveSummaryDto,
} from './dto/presentations.dto';
import { PresentationStatus } from '@prisma/client';

@Injectable()
export class PresentationsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==================== Helpers ====================

  private getPresentationNumber(time: string): number {
    const hour = parseInt(time.split(':')[0], 10);
    if (hour < 12) return 1;
    if (hour < 16) return 2;
    return 3;
  }

  private generatePresentationName(
    teamName: string,
    date: Date,
    number: number,
  ): string {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const nn = String(number).padStart(2, '0');
    // Формат: DDMMYY (день-месяц-год)
    return `${teamName}${dd}${mm}${yy}${nn}`;
  }

  private presentationInclude() {
    return {
      trip: { select: { id: true, name: true, teamName: true, status: true } },
      type: true,
      venue: true,
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
    };
  }

  // ==================== CRUD ====================

  async findAll(
    filter?: string,
    userId?: string,
    userPermissions?: string[],
  ) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const where: any = {};

    // view-person: презентации где пользователь в составе ИЛИ выезд где он ГА/МВ_ГА
    const isViewAll = userPermissions?.includes('presentations.view-all');
    if (!isViewAll && userId) {
      where.OR = [
        // Пользователь в составе конкретной презентации
        { crew: { some: { userId } } },
        // Пользователь — ГА или МВ_ГА в выезде (видит все презентации выезда)
        {
          trip: {
            crew: {
              some: {
                userId,
                role: { in: ['GA', 'MV_GA'] },
              },
            },
          },
        },
      ];
    }

    if (filter === 'active') {
      where.status = { not: 'CANCELLED' };
      where.date = { gte: todayStart, lt: todayEnd };
    } else if (filter === 'planned') {
      where.status = { not: 'CANCELLED' };
      where.date = { gte: todayEnd };
    } else if (filter === 'completed') {
      where.status = { not: 'CANCELLED' };
      where.date = { lt: todayStart };
    } else if (filter === 'cancelled') {
      where.status = 'CANCELLED';
    }

    return this.prisma.presentation.findMany({
      where,
      include: this.presentationInclude(),
      orderBy: [{ date: 'asc' }, { number: 'asc' }],
    });
  }

  async findByTrip(tripId: string) {
    return this.prisma.presentation.findMany({
      where: { tripId },
      include: this.presentationInclude(),
      orderBy: [{ date: 'asc' }, { number: 'asc' }],
    });
  }

  async findById(id: string) {
    const presentation = await this.prisma.presentation.findUnique({
      where: { id },
      include: this.presentationInclude(),
    });
    if (!presentation)
      throw new NotFoundException('errors.presentationNotFound');
    return presentation;
  }

  async create(tripId: string, dto: CreatePresentationDto, userId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        crew: true,
      },
    });
    if (!trip) throw new NotFoundException('errors.tripNotFound');

    // Нельзя создать презентацию без состава команды
    if (trip.crew.length === 0) {
      throw new BadRequestException('errors.tripNoCrewForPresentation');
    }

    const date = new Date(dto.date);

    // Validate date is within trip range
    if (date < trip.startDate || date > trip.endDate) {
      throw new BadRequestException('errors.presentationDateOutOfRange');
    }

    const number = this.getPresentationNumber(dto.time);
    const name = this.generatePresentationName(trip.teamName, date, number);

    // Проверяем уникальность номера презентации в этот день
    const existingWithSameNumber = await this.prisma.presentation.findFirst({
      where: { tripId, date, number },
    });
    if (existingWithSameNumber) {
      throw new BadRequestException(
        `На дату ${dto.date} уже есть презентация №${number}. В один день допускается максимум 3 презентации (утро=1, день=2, вечер=3) без повторений.`,
      );
    }

    // Create presentation
    const presentation = await this.prisma.presentation.create({
      data: {
        tripId,
        name,
        date,
        time: dto.time,
        number,
        typeId: dto.typeId || null,
        venueId: dto.venueId || null,
        coordinatorId: dto.coordinatorId || trip.coordinatorId || null,
        createdById: userId,
      },
    });

    // Copy crew template from trip
    if (trip.crew.length > 0) {
      await this.prisma.presentationCrew.createMany({
        data: trip.crew.map((member) => ({
          presentationId: presentation.id,
          userId: member.userId,
          role: member.role,
        })),
      });
    }

    await this.auditService.log({
      userId,
      action: 'presentation.created',
      entity: 'presentation',
      entityId: presentation.id,
      details: { tripId, name, date: dto.date, time: dto.time },
    });

    return this.findById(presentation.id);
  }

  async update(id: string, dto: UpdatePresentationDto, userId: string) {
    const presentation = await this.findById(id);
    const trip = await this.prisma.trip.findUnique({
      where: { id: presentation.tripId },
    });

    // Редактирование запрещено для закрытого выезда
    if (trip?.status === 'CLOSED') {
      throw new ForbiddenException('errors.tripIsClosed');
    }

    const updateData: any = {};

    if (dto.date || dto.time) {
      const date = dto.date ? new Date(dto.date) : presentation.date;
      const time = dto.time || presentation.time;

      // Validate date is within trip range
      if (trip && (date < trip.startDate || date > trip.endDate)) {
        throw new BadRequestException('errors.presentationDateOutOfRange');
      }

      const number = this.getPresentationNumber(time);
      const name = this.generatePresentationName(trip!.teamName, date, number);

      // Проверяем уникальность номера (исключая текущую презентацию)
      const conflict = await this.prisma.presentation.findFirst({
        where: { tripId: presentation.tripId, date, number, id: { not: id } },
      });
      if (conflict) {
        throw new BadRequestException(
          `На эту дату уже есть презентация №${number}. Допускается не более одной презентации каждого номера (1/2/3) в день.`,
        );
      }

      updateData.date = date;
      updateData.time = time;
      updateData.number = number;
      updateData.name = name;
    }

    if (dto.typeId !== undefined) updateData.typeId = dto.typeId || null;
    if (dto.venueId !== undefined) updateData.venueId = dto.venueId || null;
    if (dto.coordinatorId !== undefined)
      updateData.coordinatorId = dto.coordinatorId || null;

    const updated = await this.prisma.presentation.update({
      where: { id },
      data: updateData,
      include: this.presentationInclude(),
    });

    await this.auditService.log({
      userId,
      action: 'presentation.updated',
      entity: 'presentation',
      entityId: id,
      details: dto,
    });

    return updated;
  }

  async delete(id: string, userId: string) {
    const presentation = await this.findById(id);
    const now = new Date();

    if (presentation.date < now) {
      // Past presentation — cancel it
      const updated = await this.prisma.presentation.update({
        where: { id },
        data: { status: PresentationStatus.CANCELLED },
        include: this.presentationInclude(),
      });

      await this.auditService.log({
        userId,
        action: 'presentation.cancelled',
        entity: 'presentation',
        entityId: id,
      });

      return updated;
    } else {
      // Future presentation — delete it
      await this.prisma.presentation.delete({ where: { id } });

      await this.auditService.log({
        userId,
        action: 'presentation.deleted',
        entity: 'presentation',
        entityId: id,
      });

      return null;
    }
  }

  // ==================== Crew ====================

  async setCrew(id: string, dto: SetPresentationCrewDto, userId: string) {
    await this.findById(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.presentationCrew.deleteMany({ where: { presentationId: id } });
      if (dto.crew.length > 0) {
        await tx.presentationCrew.createMany({
          data: dto.crew.map((m) => ({
            presentationId: id,
            userId: m.userId,
            role: m.role,
          })),
        });
      }
    });

    await this.auditService.log({
      userId,
      action: 'presentation.crewUpdated',
      entity: 'presentation',
      entityId: id,
      details: { crew: dto.crew },
    });

    return this.findById(id);
  }

  // ==================== Summary ====================

  async getSummary(id: string) {
    const presentation = await this.findById(id);

    const existing = await this.prisma.presentationSummary.findMany({
      where: { presentationId: id },
    });

    // For each crew member return their summary row (or nulls if not yet filled)
    return presentation.crew.map((member: any) => {
      const userId = member.userId || member.user?.id;
      const row = existing.find((r) => r.userId === userId);
      return {
        userId,
        user: member.user,
        successApproach: row?.successApproach ?? null,
        totalApproach: row?.totalApproach ?? null,
        refusalCount: row?.refusalCount ?? null,
        refusalValue: row?.refusalValue ?? null,
        rewriteCount: row?.rewriteCount ?? null,
        rewriteValue: row?.rewriteValue ?? null,
      };
    });
  }

  async saveSummary(
    id: string,
    dto: SaveSummaryDto,
    userId: string,
    userPermissions: string[] = [],
  ) {
    const isAdmin = userPermissions.includes('trips.admin');
    const hasViewPres =
      userPermissions.includes('presentations.view-all') ||
      userPermissions.includes('presentations.view-person');

    if (!isAdmin) {
      // Проверяем роль пользователя в составе поездки (GA или MV_GA)
      const presentation = await this.prisma.presentation.findUnique({
        where: { id },
        select: {
          trip: {
            select: {
              crew: { where: { userId }, select: { role: true } },
            },
          },
        },
      });
      const myRole = presentation?.trip?.crew?.[0]?.role;
      const isGa = myRole === 'GA' || myRole === 'MV_GA';
      if (!hasViewPres || !isGa) {
        throw new ForbiddenException('errors.forbidden');
      }
    }

    await this.findById(id);

    await this.prisma.$transaction(async (tx) => {
      for (const row of dto.rows) {
        await tx.presentationSummary.upsert({
          where: {
            presentationId_userId: { presentationId: id, userId: row.userId },
          },
          create: {
            presentationId: id,
            userId: row.userId,
            successApproach: row.successApproach ?? null,
            totalApproach: row.totalApproach ?? null,
            refusalCount: row.refusalCount ?? null,
            refusalValue: row.refusalValue ?? null,
            rewriteCount: row.rewriteCount ?? null,
            rewriteValue: row.rewriteValue ?? null,
          },
          update: {
            successApproach: row.successApproach ?? null,
            totalApproach: row.totalApproach ?? null,
            refusalCount: row.refusalCount ?? null,
            refusalValue: row.refusalValue ?? null,
            rewriteCount: row.rewriteCount ?? null,
            rewriteValue: row.rewriteValue ?? null,
          },
        });
      }
    });

    await this.auditService.log({
      userId,
      action: 'presentation.summaryUpdated',
      entity: 'presentation',
      entityId: id,
    });

    return this.getSummary(id);
  }
}

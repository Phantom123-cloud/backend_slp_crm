import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreatePresentationDto,
  UpdatePresentationDto,
  SetPresentationCrewDto,
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

  private generatePresentationName(teamName: string, date: Date, number: number): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${teamName} ${dd}.${mm} #${number}`;
  }

  private presentationInclude() {
    return {
      trip: { select: { id: true, name: true, teamName: true, status: true } },
      type: true,
      venue: true,
      coordinator: { select: { id: true, firstName: true, lastName: true, middleName: true } },
      crew: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, middleName: true, tradeCode: true } },
        },
        orderBy: { role: 'asc' as const },
      },
    };
  }

  // ==================== CRUD ====================

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
    if (!presentation) throw new NotFoundException('errors.presentationNotFound');
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

    const date = new Date(dto.date);

    // Validate date is within trip range
    if (date < trip.startDate || date > trip.endDate) {
      throw new BadRequestException('errors.presentationDateOutOfRange');
    }

    const number = this.getPresentationNumber(dto.time);
    const name = this.generatePresentationName(trip.teamName, date, number);

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
    const trip = await this.prisma.trip.findUnique({ where: { id: presentation.tripId } });

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

      updateData.date = date;
      updateData.time = time;
      updateData.number = number;
      updateData.name = name;
    }

    if (dto.typeId !== undefined) updateData.typeId = dto.typeId || null;
    if (dto.venueId !== undefined) updateData.venueId = dto.venueId || null;
    if (dto.coordinatorId !== undefined) updateData.coordinatorId = dto.coordinatorId || null;

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
}

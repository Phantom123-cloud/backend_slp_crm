import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreatePresentationTypeDto, UpdatePresentationTypeDto,
  CreateVenueDto, UpdateVenueDto,
} from './dto/directories.dto';

@Injectable()
export class DirectoriesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==================== Presentation Types ====================

  async findAllPresentationTypes() {
    return this.prisma.presentationType.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createPresentationType(dto: CreatePresentationTypeDto, userId: string) {
    const exists = await this.prisma.presentationType.findUnique({
      where: { name: dto.name },
    });
    if (exists) throw new ConflictException('errors.presentationTypeExists');

    const type = await this.prisma.presentationType.create({ data: dto });

    await this.auditService.log({
      userId,
      action: 'presentationType.created',
      entity: 'presentationType',
      entityId: type.id,
      details: dto,
    });

    return type;
  }

  async updatePresentationType(id: string, dto: UpdatePresentationTypeDto, userId: string) {
    const type = await this.prisma.presentationType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('errors.presentationTypeNotFound');

    if (dto.name && dto.name !== type.name) {
      const exists = await this.prisma.presentationType.findUnique({ where: { name: dto.name } });
      if (exists) throw new ConflictException('errors.presentationTypeExists');
    }

    const updated = await this.prisma.presentationType.update({ where: { id }, data: dto });

    await this.auditService.log({
      userId,
      action: 'presentationType.updated',
      entity: 'presentationType',
      entityId: id,
      details: dto,
    });

    return updated;
  }

  async deletePresentationType(id: string, userId: string) {
    const type = await this.prisma.presentationType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('errors.presentationTypeNotFound');

    // Check if in use
    const usageCount = await this.prisma.presentation.count({ where: { typeId: id } });
    if (usageCount > 0) throw new ConflictException('errors.presentationTypeInUse');

    await this.prisma.presentationType.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'presentationType.deleted',
      entity: 'presentationType',
      entityId: id,
    });
  }

  // ==================== Venues ====================

  async findAllVenues() {
    return this.prisma.venue.findMany({
      orderBy: [{ city: 'asc' }, { venueName: 'asc' }],
    });
  }

  async createVenue(dto: CreateVenueDto, userId: string) {
    const exists = await this.prisma.venue.findUnique({
      where: {
        city_address_venueName: {
          city: dto.city,
          address: dto.address,
          venueName: dto.venueName,
        },
      },
    });
    if (exists) throw new ConflictException('errors.venueExists');

    const venue = await this.prisma.venue.create({ data: dto });

    await this.auditService.log({
      userId,
      action: 'venue.created',
      entity: 'venue',
      entityId: venue.id,
      details: dto,
    });

    return venue;
  }

  async updateVenue(id: string, dto: UpdateVenueDto, userId: string) {
    const venue = await this.prisma.venue.findUnique({ where: { id } });
    if (!venue) throw new NotFoundException('errors.venueNotFound');

    const updated = await this.prisma.venue.update({ where: { id }, data: dto });

    await this.auditService.log({
      userId,
      action: 'venue.updated',
      entity: 'venue',
      entityId: id,
      details: dto,
    });

    return updated;
  }

  async deleteVenue(id: string, userId: string) {
    const venue = await this.prisma.venue.findUnique({ where: { id } });
    if (!venue) throw new NotFoundException('errors.venueNotFound');

    const usageCount = await this.prisma.presentation.count({ where: { venueId: id } });
    if (usageCount > 0) throw new ConflictException('errors.venueInUse');

    await this.prisma.venue.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'venue.deleted',
      entity: 'venue',
      entityId: id,
    });
  }
}

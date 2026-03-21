import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreatePresentationTypeDto,
  UpdatePresentationTypeDto,
  CreateVenueDto,
  UpdateVenueDto,
  CreateExpenseTypeDto,
  UpdateExpenseTypeDto,
  CreateBankDto,
  UpdateBankDto,
  CreateCompanyDto,
  UpdateCompanyDto,
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

  async updatePresentationType(
    id: string,
    dto: UpdatePresentationTypeDto,
    userId: string,
  ) {
    const type = await this.prisma.presentationType.findUnique({
      where: { id },
    });
    if (!type) throw new NotFoundException('errors.presentationTypeNotFound');

    if (dto.name && dto.name !== type.name) {
      const exists = await this.prisma.presentationType.findUnique({
        where: { name: dto.name },
      });
      if (exists) throw new ConflictException('errors.presentationTypeExists');
    }

    const updated = await this.prisma.presentationType.update({
      where: { id },
      data: dto,
    });

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
    const type = await this.prisma.presentationType.findUnique({
      where: { id },
    });
    if (!type) throw new NotFoundException('errors.presentationTypeNotFound');

    // Check if in use
    const usageCount = await this.prisma.presentation.count({
      where: { typeId: id },
    });
    if (usageCount > 0)
      throw new ConflictException('errors.presentationTypeInUse');

    await this.prisma.presentationType.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'presentationType.deleted',
      entity: 'presentationType',
      entityId: id,
    });
  }

  // ==================== Expense Types ====================

  async findAllExpenseTypes() {
    return this.prisma.expenseType.findMany({ orderBy: { name: 'asc' } });
  }

  async createExpenseType(dto: CreateExpenseTypeDto, userId: string) {
    const exists = await this.prisma.expenseType.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('errors.expenseTypeExists');

    const type = await this.prisma.expenseType.create({ data: dto });

    await this.auditService.log({
      userId,
      action: 'expenseType.created',
      entity: 'expenseType',
      entityId: type.id,
      details: dto,
    });

    return type;
  }

  async updateExpenseType(id: string, dto: UpdateExpenseTypeDto, userId: string) {
    const type = await this.prisma.expenseType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('errors.expenseTypeNotFound');

    if (dto.name && dto.name !== type.name) {
      const exists = await this.prisma.expenseType.findUnique({ where: { name: dto.name } });
      if (exists) throw new ConflictException('errors.expenseTypeExists');
    }

    const updated = await this.prisma.expenseType.update({ where: { id }, data: dto });

    await this.auditService.log({
      userId,
      action: 'expenseType.updated',
      entity: 'expenseType',
      entityId: id,
      details: dto,
    });

    return updated;
  }

  async deleteExpenseType(id: string, userId: string) {
    const type = await this.prisma.expenseType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('errors.expenseTypeNotFound');

    const usageCount = await this.prisma.walletTx.count({ where: { expenseTypeId: id } });
    if (usageCount > 0) throw new ConflictException('errors.expenseTypeInUse');

    await this.prisma.expenseType.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'expenseType.deleted',
      entity: 'expenseType',
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

    const updated = await this.prisma.venue.update({
      where: { id },
      data: dto,
    });

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

    const usageCount = await this.prisma.presentation.count({
      where: { venueId: id },
    });
    if (usageCount > 0) throw new ConflictException('errors.venueInUse');

    await this.prisma.venue.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'venue.deleted',
      entity: 'venue',
      entityId: id,
    });
  }

  // ==================== Banks ====================

  async findAllBanks() {
    return this.prisma.bank.findMany({ orderBy: { name: 'asc' } });
  }

  async createBank(dto: CreateBankDto, userId: string) {
    const exists = await this.prisma.bank.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('errors.bankExists');

    const bank = await this.prisma.bank.create({ data: dto });

    await this.auditService.log({
      userId,
      action: 'bank.created',
      entity: 'bank',
      entityId: bank.id,
      details: dto,
    });

    return bank;
  }

  async updateBank(id: string, dto: UpdateBankDto, userId: string) {
    const bank = await this.prisma.bank.findUnique({ where: { id } });
    if (!bank) throw new NotFoundException('errors.bankNotFound');

    if (dto.name && dto.name !== bank.name) {
      const exists = await this.prisma.bank.findUnique({ where: { name: dto.name } });
      if (exists) throw new ConflictException('errors.bankExists');
    }

    const updated = await this.prisma.bank.update({ where: { id }, data: dto });

    await this.auditService.log({
      userId,
      action: 'bank.updated',
      entity: 'bank',
      entityId: id,
      details: dto,
    });

    return updated;
  }

  async deleteBank(id: string, userId: string) {
    const bank = await this.prisma.bank.findUnique({ where: { id } });
    if (!bank) throw new NotFoundException('errors.bankNotFound');

    // Проверяем использование в выездах
    const usageCount = await this.prisma.tripBank.count({ where: { bankId: id } });
    if (usageCount > 0) throw new ConflictException('errors.bankInUse');

    await this.prisma.bank.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'bank.deleted',
      entity: 'bank',
      entityId: id,
    });
  }

  // ==================== Companies ====================

  async findAllCompanies() {
    return this.prisma.company.findMany({ orderBy: { name: 'asc' } });
  }

  async createCompany(dto: CreateCompanyDto, userId: string) {
    const exists = await this.prisma.company.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('errors.companyExists');

    const company = await this.prisma.company.create({ data: dto });

    await this.auditService.log({
      userId,
      action: 'company.created',
      entity: 'company',
      entityId: company.id,
      details: dto,
    });

    return company;
  }

  async updateCompany(id: string, dto: UpdateCompanyDto, userId: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('errors.companyNotFound');

    if (dto.name && dto.name !== company.name) {
      const exists = await this.prisma.company.findUnique({ where: { name: dto.name } });
      if (exists) throw new ConflictException('errors.companyExists');
    }

    const updated = await this.prisma.company.update({ where: { id }, data: dto });

    await this.auditService.log({
      userId,
      action: 'company.updated',
      entity: 'company',
      entityId: id,
      details: dto,
    });

    return updated;
  }

  async deleteCompany(id: string, userId: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('errors.companyNotFound');

    const usageCount = await this.prisma.tripCompany.count({ where: { companyId: id } });
    if (usageCount > 0) throw new ConflictException('errors.companyInUse');

    await this.prisma.company.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'company.deleted',
      entity: 'company',
      entityId: id,
    });
  }
}

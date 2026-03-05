import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  CreateTransactionDto,
  TransactionTypeDto,
} from './dto/warehouses.dto';
import { TransactionType, WarehouseType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  private getUserPermissions(user: {
    role?: { permissions: { permission: { slug: string } }[] } | null;
  }): string[] {
    if (!user.role) return [];
    return user.role.permissions.map((rp) => rp.permission.slug);
  }

  // ==================== WAREHOUSES ====================

  async findAll(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) throw new ForbiddenException();
    const perms = this.getUserPermissions(user);

    const canViewAll = perms.includes('warehouses.view') || perms.includes('warehouses.manage');
    const canViewTrips = perms.includes('trips.admin') || perms.includes('trips.view-person');

    if (canViewAll && perms.includes('trips.admin')) {
      // See everything
      return this.prisma.warehouse.findMany({
        include: { _count: { select: { stock: true } }, owner: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (canViewAll) {
      // See CENTRAL + PERSONAL, but TRIP only if trips.admin
      const whereClause: any = perms.includes('trips.admin')
        ? {}
        : { type: { not: WarehouseType.TRIP } };
      return this.prisma.warehouse.findMany({
        where: whereClause,
        include: { _count: { select: { stock: true } }, owner: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      });
    }

    // No warehouses.view — only TRIP warehouses where user is MV/MV_GA crew
    if (canViewTrips) {
      const tripWarehouses = await this.prisma.warehouse.findMany({
        where: {
          type: WarehouseType.TRIP,
          trip: { crew: { some: { userId, role: { in: ['MV', 'MV_GA'] } } } },
        },
        include: { _count: { select: { stock: true } }, owner: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return tripWarehouses;
    }

    return [];
  }

  async findOne(id: string, userId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        stock: {
          include: { product: true },
          orderBy: { product: { name: 'asc' } },
        },
        owner: { select: { id: true, firstName: true, lastName: true } },
        trip: { select: { id: true, name: true } },
      },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    await this.checkViewAccess(warehouse, userId);
    return warehouse;
  }

  async create(dto: CreateWarehouseDto, userId: string) {
    const owner = await this.prisma.user.findUnique({
      where: { id: dto.ownerId },
      select: { firstName: true, lastName: true },
    });
    if (!owner) throw new NotFoundException('Owner not found');

    const name =
      dto.type === 'CENTRAL'
        ? `Центральный склад ${dto.name || ''}`
        : `Склад ${owner.lastName} ${owner.firstName}`;

    return this.prisma.warehouse.create({
      data: {
        name,
        type: dto.type as unknown as WarehouseType,
        ownerId: dto.ownerId,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    let name = dto.name;

    // For PERSONAL: if owner changes and no explicit name, auto-generate name
    if (dto.ownerId && warehouse.type === WarehouseType.PERSONAL && !dto.name) {
      const owner = await this.prisma.user.findUnique({
        where: { id: dto.ownerId },
        select: { firstName: true, lastName: true },
      });
      if (owner) name = `Склад ${owner.lastName} ${owner.firstName}`;
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return this.prisma.warehouse.update({ where: { id }, data: { isActive: false } });
  }

  // ==================== TRANSACTIONS ====================

  async getTransactions(warehouseId: string, userId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    await this.checkViewAccess(warehouse, userId);

    return this.prisma.transaction.findMany({
      where: {
        OR: [
          { fromWarehouseId: warehouseId },
          { toWarehouseId: warehouseId },
        ],
      },
      include: {
        items: { include: { product: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTransaction(warehouseId: string, dto: CreateTransactionDto, userId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    await this.checkTransactAccess(warehouse, userId);

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one item is required');
    }

    if (dto.type === TransactionTypeDto.TRANSFER) {
      if (!dto.toWarehouseId) throw new BadRequestException('toWarehouseId required for TRANSFER');
      const toWarehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.toWarehouseId } });
      if (!toWarehouse) throw new NotFoundException('Destination warehouse not found');

      const pairId = uuidv4();
      return this.prisma.$transaction(async (tx) => {
        // TRANSFER_OUT from source
        const outTx = await tx.transaction.create({
          data: {
            type: TransactionType.TRANSFER_OUT,
            fromWarehouseId: warehouseId,
            note: dto.note,
            pairId,
            createdById: userId,
            items: {
              create: dto.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
          include: { items: { include: { product: true } }, createdBy: { select: { id: true, firstName: true, lastName: true } } },
        });

        // Update stock (decrement source)
        for (const item of dto.items) {
          await tx.stock.upsert({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
            create: { warehouseId, productId: item.productId, quantity: -item.quantity },
            update: { quantity: { decrement: item.quantity } },
          });
        }

        // TRANSFER_IN to destination
        await tx.transaction.create({
          data: {
            type: TransactionType.TRANSFER_IN,
            toWarehouseId: dto.toWarehouseId,
            note: dto.note,
            pairId,
            createdById: userId,
            items: {
              create: dto.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
        });

        // Update stock (increment destination)
        for (const item of dto.items) {
          await tx.stock.upsert({
            where: { warehouseId_productId: { warehouseId: dto.toWarehouseId!, productId: item.productId } },
            create: { warehouseId: dto.toWarehouseId!, productId: item.productId, quantity: item.quantity },
            update: { quantity: { increment: item.quantity } },
          });
        }

        return outTx;
      });
    }

    // Non-transfer transactions
    const isIncoming = dto.type === TransactionTypeDto.INCOMING;
    const sign = isIncoming ? 1 : -1;

    const txType = dto.type as unknown as TransactionType;
    const fromOrTo = isIncoming
      ? { toWarehouseId: warehouseId }
      : { fromWarehouseId: warehouseId };

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type: txType,
          ...fromOrTo,
          note: dto.note,
          createdById: userId,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      for (const item of dto.items) {
        await tx.stock.upsert({
          where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          create: { warehouseId, productId: item.productId, quantity: sign * item.quantity },
          update: { quantity: { increment: sign * item.quantity } },
        });
      }

      return transaction;
    });
  }

  // ==================== Access helpers ====================

  private async checkViewAccess(warehouse: { id: string; type: string; tripId?: string | null }, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) throw new ForbiddenException();
    const perms = this.getUserPermissions(user);

    if (perms.includes('warehouses.manage') || perms.includes('warehouses.view') || perms.includes('trips.admin')) {
      return;
    }

    if (warehouse.type === 'TRIP' && warehouse.tripId && perms.includes('trips.view-person')) {
      const crew = await this.prisma.tripCrew.findFirst({
        where: { tripId: warehouse.tripId, userId, role: { in: ['MV', 'MV_GA'] } },
      });
      if (crew) return;
    }

    throw new ForbiddenException();
  }

  async checkTransactAccess(warehouse: { id: string; type: string; tripId?: string | null }, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) throw new ForbiddenException();
    const perms = this.getUserPermissions(user);

    if (perms.includes('warehouses.manage') || perms.includes('trips.admin')) {
      return;
    }

    if (warehouse.type === 'TRIP' && warehouse.tripId) {
      const crew = await this.prisma.tripCrew.findFirst({
        where: { tripId: warehouse.tripId, userId, role: { in: ['MV', 'MV_GA'] } },
      });
      if (crew) return;
    }

    throw new ForbiddenException();
  }
}

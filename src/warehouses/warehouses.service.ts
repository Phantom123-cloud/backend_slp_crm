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
import { TransactionType, TransferStatus, WarehouseType } from '@prisma/client';
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

  private warehouseListInclude() {
    return {
      _count: { select: { stock: true, outgoing: true, incoming: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
    };
  }

  async findAll(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) throw new ForbiddenException();
    const perms = this.getUserPermissions(user);

    const canManage = perms.includes('warehouses.manage');
    const canViewAll = perms.includes('warehouses.view-all');
    const canViewPerson = perms.includes('warehouses.view-person');

    // warehouses.manage or view-all → see ALL warehouses (TRIP + CENTRAL + PERSONAL)
    if (canManage || canViewAll) {
      return this.prisma.warehouse.findMany({
        include: this.warehouseListInclude(),
        orderBy: { createdAt: 'desc' },
      });
    }

    // view-person → own non-trip warehouses (ownerId === userId)
    if (canViewPerson) {
      return this.prisma.warehouse.findMany({
        where: { ownerId: userId, type: { not: WarehouseType.TRIP } },
        include: this.warehouseListInclude(),
        orderBy: { createdAt: 'desc' },
      });
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

  async deactivate(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { stock: true },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const nonZeroStock = warehouse.stock.filter((s) => Number(s.quantity) !== 0);
    if (nonZeroStock.length > 0)
      throw new BadRequestException('errors.warehouseNotEmpty');

    const pendingTransfers = await this.prisma.transaction.count({
      where: {
        transferStatus: TransferStatus.PENDING,
        OR: [{ fromWarehouseId: id }, { toWarehouseId: id }],
      },
    });
    if (pendingTransfers > 0)
      throw new BadRequestException('errors.warehousePendingTransfers');

    return this.prisma.warehouse.update({ where: { id }, data: { isActive: false } });
  }

  async reactivate(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return this.prisma.warehouse.update({ where: { id }, data: { isActive: true } });
  }

  async remove(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const txCount = await this.prisma.transaction.count({
      where: { OR: [{ fromWarehouseId: id }, { toWarehouseId: id }] },
    });
    if (txCount > 0)
      throw new BadRequestException('errors.warehouseHasTransactions');

    return this.prisma.warehouse.delete({ where: { id } });
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
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
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
        // TRANSFER_OUT with PENDING status — stores both sender and receiver
        const outTx = await tx.transaction.create({
          data: {
            type: TransactionType.TRANSFER_OUT,
            fromWarehouseId: warehouseId,
            toWarehouseId: dto.toWarehouseId,   // destination stored here too
            transferStatus: TransferStatus.PENDING,
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
          include: {
            items: { include: { product: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
            fromWarehouse: { select: { id: true, name: true } },
            toWarehouse: { select: { id: true, name: true } },
          },
        });

        // Deduct stock from sender immediately
        for (const item of dto.items) {
          await tx.stock.upsert({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
            create: { warehouseId, productId: item.productId, quantity: -item.quantity },
            update: { quantity: { decrement: item.quantity } },
          });
        }

        // TRANSFER_IN is NOT created yet — waiting for receiver to accept
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

  // ==================== Transfer accept / cancel ====================

  async acceptTransfer(txId: string, userId: string) {
    const outTx = await this.prisma.transaction.findUnique({
      where: { id: txId },
      include: { items: true },
    });
    if (!outTx) throw new NotFoundException('Transfer not found');
    if (outTx.type !== TransactionType.TRANSFER_OUT)
      throw new BadRequestException('Not a transfer');
    if (outTx.transferStatus !== TransferStatus.PENDING)
      throw new BadRequestException('Transfer is not pending');
    if (!outTx.toWarehouseId) throw new BadRequestException('Transfer has no destination');

    // Only receiver's warehouse manager can accept
    const toWarehouse = await this.prisma.warehouse.findUnique({ where: { id: outTx.toWarehouseId } });
    if (!toWarehouse) throw new NotFoundException('Destination warehouse not found');
    await this.checkTransactAccess(toWarehouse, userId);

    return this.prisma.$transaction(async (tx) => {
      // Create TRANSFER_IN record (receiver's history)
      await tx.transaction.create({
        data: {
          type: TransactionType.TRANSFER_IN,
          fromWarehouseId: outTx.fromWarehouseId,
          toWarehouseId: outTx.toWarehouseId,
          note: outTx.note,
          pairId: outTx.pairId,
          createdById: userId,
          items: {
            create: outTx.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
      });

      // Add stock to receiver
      for (const item of outTx.items) {
        await tx.stock.upsert({
          where: { warehouseId_productId: { warehouseId: outTx.toWarehouseId!, productId: item.productId } },
          create: { warehouseId: outTx.toWarehouseId!, productId: item.productId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        });
      }

      // Mark TRANSFER_OUT as COMPLETED
      return tx.transaction.update({
        where: { id: txId },
        data: { transferStatus: TransferStatus.COMPLETED },
        include: {
          items: { include: { product: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
        },
      });
    });
  }

  async cancelTransfer(txId: string, userId: string) {
    const outTx = await this.prisma.transaction.findUnique({
      where: { id: txId },
      include: { items: true },
    });
    if (!outTx) throw new NotFoundException('Transfer not found');
    if (outTx.type !== TransactionType.TRANSFER_OUT)
      throw new BadRequestException('Not a transfer');
    if (outTx.transferStatus !== TransferStatus.PENDING)
      throw new BadRequestException('Transfer is not pending');
    if (!outTx.fromWarehouseId) throw new BadRequestException('Transfer has no source');

    // Only sender's warehouse manager can cancel
    const fromWarehouse = await this.prisma.warehouse.findUnique({ where: { id: outTx.fromWarehouseId } });
    if (!fromWarehouse) throw new NotFoundException('Source warehouse not found');
    await this.checkTransactAccess(fromWarehouse, userId);

    return this.prisma.$transaction(async (tx) => {
      // Return stock to sender
      for (const item of outTx.items) {
        await tx.stock.upsert({
          where: { warehouseId_productId: { warehouseId: outTx.fromWarehouseId!, productId: item.productId } },
          create: { warehouseId: outTx.fromWarehouseId!, productId: item.productId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        });
      }

      // Mark TRANSFER_OUT as CANCELLED
      return tx.transaction.update({
        where: { id: txId },
        data: { transferStatus: TransferStatus.CANCELLED },
        include: {
          items: { include: { product: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
        },
      });
    });
  }

  // ==================== Access helpers ====================

  private async getUserPerms(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) throw new ForbiddenException();
    return this.getUserPermissions(user);
  }

  private async checkViewAccess(
    warehouse: { id: string; type: string; tripId?: string | null; ownerId?: string | null },
    userId: string,
  ) {
    const perms = await this.getUserPerms(userId);

    // Full manage or view-all → always OK
    if (perms.includes('warehouses.manage') || perms.includes('warehouses.view-all') || perms.includes('trips.admin')) {
      return;
    }

    // view-person + owner of this warehouse → OK
    if (perms.includes('warehouses.view-person') && warehouse.ownerId === userId) {
      return;
    }

    // TRIP warehouse: trips.view-* + MV/MV_GA crew → OK
    if (warehouse.type === 'TRIP' && warehouse.tripId) {
      const hasTripsView = perms.includes('trips.view-person') || perms.includes('trips.view-all');
      if (hasTripsView) {
        const crew = await this.prisma.tripCrew.findFirst({
          where: { tripId: warehouse.tripId, userId, role: { in: ['MV', 'MV_GA'] } },
        });
        if (crew) return;
      }
    }

    throw new ForbiddenException();
  }

  async checkTransactAccess(
    warehouse: { id: string; type: string; tripId?: string | null; ownerId?: string | null },
    userId: string,
  ) {
    const perms = await this.getUserPerms(userId);

    // Full manage → OK
    if (perms.includes('warehouses.manage') || perms.includes('trips.admin')) {
      return;
    }

    // view-person + owner → can transact on own warehouse
    if (perms.includes('warehouses.view-person') && warehouse.ownerId === userId) {
      return;
    }

    // TRIP warehouse: trips.view-* + MV/MV_GA → can transact
    if (warehouse.type === 'TRIP' && warehouse.tripId) {
      const hasTripsView = perms.includes('trips.view-person') || perms.includes('trips.view-all');
      if (hasTripsView) {
        const crew = await this.prisma.tripCrew.findFirst({
          where: { tripId: warehouse.tripId, userId, role: { in: ['MV', 'MV_GA'] } },
        });
        if (crew) return;
      }
    }

    throw new ForbiddenException();
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWalletDto,
  UpdateWalletDto,
  IncomeDto,
  TransferDto,
  ConversionDto,
  UpdateTransactionDto,
  ExportTransactionsDto,
} from './dto/wallets.dto';
import { WalletType, WalletTxType, WalletTransferStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import dayjs from 'dayjs';

@Injectable()
export class WalletsService {
  constructor(private prisma: PrismaService) {}

  // ==================== Helpers ====================

  private async getUserPerms(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) throw new ForbiddenException();
    if (!user.role) return [];
    return user.role.permissions.map((rp) => rp.permission.slug);
  }

  /** Проверка доступа на просмотр кошелька */
  private async checkViewAccess(
    wallet: { id: string; type: string; tripId?: string | null; ownerId?: string | null },
    userId: string,
  ) {
    const perms = await this.getUserPerms(userId);
    if (perms.includes('wallets.manage') || perms.includes('wallets.view-all')) return;

    if (perms.includes('wallets.view-person') || perms.includes('wallets.edit') || perms.includes('wallets.transaction')) {
      // PERSONAL: ownerId совпадает
      if (wallet.type === 'PERSONAL' && wallet.ownerId === userId) return;
      // TRIP: пользователь ГА или МВ/ГА в этом выезде
      if (wallet.type === 'TRIP' && wallet.tripId) {
        const crew = await this.prisma.tripCrew.findFirst({
          where: { tripId: wallet.tripId, userId, role: { in: ['GA', 'MV_GA'] } },
        });
        if (crew) return;
      }
    }

    throw new ForbiddenException();
  }

  /** Проверка доступа на совершение транзакций в кошельке */
  private async checkTransactAccess(
    wallet: { id: string; type: string; tripId?: string | null; ownerId?: string | null; isBlocked: boolean },
    userId: string,
  ) {
    if (wallet.isBlocked) throw new BadRequestException('errors.walletBlocked');

    const perms = await this.getUserPerms(userId);
    if (perms.includes('wallets.manage')) return;

    // Без права на транзакции — запрещено
    if (!perms.includes('wallets.transaction')) throw new ForbiddenException();

    // PERSONAL: только владелец
    if (wallet.type === 'PERSONAL' && wallet.ownerId === userId) return;

    // TRIP: только ГА или МВ_ГА в этом выезде
    if (wallet.type === 'TRIP' && wallet.tripId) {
      const crew = await this.prisma.tripCrew.findFirst({
        where: { tripId: wallet.tripId, userId, role: { in: ['GA', 'MV_GA'] } },
      });
      if (crew) return;
    }

    throw new ForbiddenException();
  }

  private walletListInclude() {
    return {
      owner: { select: { id: true, firstName: true, lastName: true } },
      trip: { select: { id: true, name: true } },
      balances: true,
      _count: { select: { transactions: true } },
    };
  }

  // ==================== WALLETS ====================

  async findAll(userId: string) {
    const perms = await this.getUserPerms(userId);
    const canViewAll = perms.includes('wallets.view-all');
    const canManage = perms.includes('wallets.manage');
    const canViewPerson = perms.includes('wallets.view-person') || perms.includes('wallets.edit') || perms.includes('wallets.transaction');

    if (canManage || canViewAll) {
      return this.prisma.wallet.findMany({
        include: this.walletListInclude(),
        orderBy: { createdAt: 'desc' },
      });
    }

    if (canViewPerson) {
      // Собственные PERSONAL кошельки + TRIP кошельки где пользователь ГА/МВ_ГА
      const [personalWallets, tripWallets] = await Promise.all([
        this.prisma.wallet.findMany({
          where: { type: WalletType.PERSONAL, ownerId: userId },
          include: this.walletListInclude(),
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.wallet.findMany({
          where: {
            type: WalletType.TRIP,
            trip: { crew: { some: { userId, role: { in: ['GA', 'MV_GA'] } } } },
          },
          include: this.walletListInclude(),
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return [...personalWallets, ...tripWallets];
    }

    return [];
  }

  async findOne(id: string, userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        trip: { select: { id: true, name: true } },
        balances: { orderBy: { currency: 'asc' } },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    await this.checkViewAccess(wallet, userId);
    return wallet;
  }

  async create(dto: CreateWalletDto, userId: string) {
    // Только PERSONAL кошельки создаются вручную
    const ownerId = dto.ownerId ?? userId;
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { firstName: true, lastName: true },
    });
    if (!owner) throw new NotFoundException('Owner not found');

    const name = dto.name ?? `Кошелёк ${owner.lastName} ${owner.firstName}`;

    return this.prisma.wallet.create({
      data: {
        type: WalletType.PERSONAL,
        name,
        ownerId,
        createdById: userId,
      },
      include: this.walletListInclude(),
    });
  }

  async update(id: string, dto: UpdateWalletDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    let name = dto.name;
    if (dto.ownerId && wallet.type === WalletType.PERSONAL && !dto.name) {
      const owner = await this.prisma.user.findUnique({
        where: { id: dto.ownerId },
        select: { firstName: true, lastName: true },
      });
      if (owner) name = `Кошелёк ${owner.lastName} ${owner.firstName}`;
    }

    return this.prisma.wallet.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
      },
      include: this.walletListInclude(),
    });
  }

  async block(id: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
      include: { balances: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    // Блокировать можно только PERSONAL и только если баланс нулевой
    if (wallet.type !== WalletType.PERSONAL) {
      throw new BadRequestException('errors.onlyPersonalCanBeBlocked');
    }
    const nonZero = wallet.balances.filter((b) => Number(b.amount) !== 0);
    if (nonZero.length > 0) {
      throw new BadRequestException('errors.walletNotEmpty');
    }

    return this.prisma.wallet.update({ where: { id }, data: { isBlocked: true } });
  }

  async unblock(id: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return this.prisma.wallet.update({ where: { id }, data: { isBlocked: false } });
  }

  async remove(id: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    if (wallet.type !== WalletType.PERSONAL) {
      throw new BadRequestException('errors.onlyPersonalCanBeDeleted');
    }

    const txCount = await this.prisma.walletTx.count({ where: { walletId: id } });
    if (txCount > 0) throw new BadRequestException('errors.walletHasTransactions');

    return this.prisma.wallet.delete({ where: { id } });
  }

  // ==================== TRANSACTIONS ====================

  async getPendingIncomingTransfers(walletId: string, userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    await this.checkViewAccess(wallet, userId);

    return this.prisma.walletTransfer.findMany({
      where: { toWalletId: walletId, status: WalletTransferStatus.PENDING },
      include: {
        fromWallet: { select: { id: true, name: true, type: true, trip: { select: { id: true, name: true } } } },
        outTx: { select: { id: true, createdAt: true, description: true, createdBy: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTransactions(walletId: string, userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    await this.checkViewAccess(wallet, userId);

    return this.prisma.walletTx.findMany({
      where: { walletId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        closedBy: { select: { id: true, firstName: true, lastName: true } },
        expenseType: { select: { id: true, name: true } },
        images: true,
        reversalOf: { select: { id: true } },
        reversedBy: { select: { id: true } },
        transferOut: {
          include: {
            toWallet: { select: { id: true, name: true, type: true, trip: { select: { id: true, name: true } } } },
          },
        },
        transferIn: {
          include: {
            fromWallet: { select: { id: true, name: true, type: true, trip: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async income(walletId: string, dto: IncomeDto, userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    await this.checkTransactAccess(wallet, userId);

    if (dto.images && dto.images.length > 15) {
      throw new BadRequestException('errors.tooManyImages');
    }

    return this.prisma.$transaction(async (tx) => {
      const walletTx = await tx.walletTx.create({
        data: {
          walletId,
          type: WalletTxType.INCOME,
          currency: dto.currency,
          amount: dto.amount,
          expenseTypeId: dto.expenseTypeId,
          description: dto.description,
          createdById: userId,
          images: dto.images?.length
            ? { create: dto.images.map((url) => ({ url, filename: url.split('/').pop() })) }
            : undefined,
        },
        include: { images: true, expenseType: true },
      });

      // Увеличиваем баланс по валюте
      await tx.walletBalance.upsert({
        where: { walletId_currency: { walletId, currency: dto.currency } },
        create: { walletId, currency: dto.currency, amount: dto.amount },
        update: { amount: { increment: dto.amount } },
      });

      return walletTx;
    });
  }

  async expense(walletId: string, dto: IncomeDto, userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    await this.checkTransactAccess(wallet, userId);

    if (dto.images && dto.images.length > 15) {
      throw new BadRequestException('errors.tooManyImages');
    }

    return this.prisma.$transaction(async (tx) => {
      const walletTx = await tx.walletTx.create({
        data: {
          walletId,
          type: WalletTxType.EXPENSE,
          currency: dto.currency,
          amount: dto.amount,
          expenseTypeId: dto.expenseTypeId,
          description: dto.description,
          createdById: userId,
          images: dto.images?.length
            ? { create: dto.images.map((url) => ({ url, filename: url.split('/').pop() })) }
            : undefined,
        },
        include: { images: true, expenseType: true },
      });

      // Уменьшаем баланс по валюте
      await tx.walletBalance.upsert({
        where: { walletId_currency: { walletId, currency: dto.currency } },
        create: { walletId, currency: dto.currency, amount: -dto.amount },
        update: { amount: { decrement: dto.amount } },
      });

      return walletTx;
    });
  }

  async transfer(walletId: string, dto: TransferDto, userId: string) {
    const fromWallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!fromWallet) throw new NotFoundException('Source wallet not found');
    await this.checkTransactAccess(fromWallet, userId);

    const toWallet = await this.prisma.wallet.findUnique({ where: { id: dto.toWalletId } });
    if (!toWallet) throw new NotFoundException('Destination wallet not found');
    if (toWallet.isBlocked) throw new BadRequestException('errors.destinationWalletBlocked');
    if (walletId === dto.toWalletId) throw new BadRequestException('errors.sameWallet');

    if (dto.images && dto.images.length > 15) {
      throw new BadRequestException('errors.tooManyImages');
    }

    // Проверяем достаточность баланса
    const balance = await this.prisma.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: dto.currency } },
    });
    const currentAmount = balance ? Number(balance.amount) : 0;
    if (currentAmount < dto.amount) {
      throw new BadRequestException('errors.insufficientBalance');
    }

    return this.prisma.$transaction(async (tx) => {
      const imageData = dto.images?.length
        ? dto.images.map((url) => ({ url, filename: url.split('/').pop() }))
        : [];

      // Только исходящая транзакция — входящая создаётся при подтверждении
      const outTx = await tx.walletTx.create({
        data: {
          walletId,
          type: WalletTxType.TRANSFER_OUT,
          currency: dto.currency,
          amount: dto.amount,
          description: dto.description,
          createdById: userId,
          images: imageData.length ? { create: imageData } : undefined,
        },
      });

      // WalletTransfer со статусом PENDING, inTxId = null пока
      await tx.walletTransfer.create({
        data: {
          fromWalletId: walletId,
          toWalletId: dto.toWalletId,
          outTxId: outTx.id,
          currency: dto.currency,
          amount: dto.amount,
          status: WalletTransferStatus.PENDING,
        },
      });

      // Снимаем баланс у отправителя немедленно
      await tx.walletBalance.upsert({
        where: { walletId_currency: { walletId, currency: dto.currency } },
        create: { walletId, currency: dto.currency, amount: -dto.amount },
        update: { amount: { decrement: dto.amount } },
      });

      return outTx;
    });
  }

  // ==================== Подтверждение / отмена перевода ====================

  async acceptWalletTransfer(transferId: string, userId: string) {
    const transfer = await this.prisma.walletTransfer.findUnique({
      where: { id: transferId },
      include: { fromWallet: true, toWallet: true, outTx: true },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== WalletTransferStatus.PENDING) {
      throw new BadRequestException('errors.transferNotPending');
    }

    // Получатель подтверждает — проверяем доступ к целевому кошельку
    if (transfer.toWallet.isBlocked) throw new BadRequestException('errors.destinationWalletBlocked');
    await this.checkTransactAccess(transfer.toWallet, userId);

    return this.prisma.$transaction(async (tx) => {
      // Создаём входящую транзакцию у получателя
      const inTx = await tx.walletTx.create({
        data: {
          walletId: transfer.toWalletId,
          type: WalletTxType.TRANSFER_IN,
          currency: transfer.currency,
          amount: transfer.amount,
          description: transfer.outTx.description,
          createdById: userId,
        },
      });

      // Зачисляем получателю
      await tx.walletBalance.upsert({
        where: { walletId_currency: { walletId: transfer.toWalletId, currency: transfer.currency } },
        create: { walletId: transfer.toWalletId, currency: transfer.currency, amount: transfer.amount },
        update: { amount: { increment: transfer.amount } },
      });

      // Обновляем WalletTransfer: COMPLETED + привязываем inTx
      return tx.walletTransfer.update({
        where: { id: transferId },
        data: { status: WalletTransferStatus.COMPLETED, inTxId: inTx.id },
        include: {
          fromWallet: { select: { id: true, name: true } },
          toWallet: { select: { id: true, name: true } },
          outTx: true,
          inTx: true,
        },
      });
    });
  }

  async cancelWalletTransfer(transferId: string, userId: string) {
    const transfer = await this.prisma.walletTransfer.findUnique({
      where: { id: transferId },
      include: { fromWallet: true },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== WalletTransferStatus.PENDING) {
      throw new BadRequestException('errors.transferNotPending');
    }

    // Отправитель отменяет
    await this.checkTransactAccess(transfer.fromWallet, userId);

    return this.prisma.$transaction(async (tx) => {
      // Возвращаем баланс отправителю
      await tx.walletBalance.upsert({
        where: { walletId_currency: { walletId: transfer.fromWalletId, currency: transfer.currency } },
        create: { walletId: transfer.fromWalletId, currency: transfer.currency, amount: transfer.amount },
        update: { amount: { increment: transfer.amount } },
      });

      // Помечаем TRANSFER_OUT транзакцию как CANCELLED через description
      // (нет поля статуса у WalletTx, но WalletTransfer.status будет CANCELLED)
      return tx.walletTransfer.update({
        where: { id: transferId },
        data: { status: WalletTransferStatus.CANCELLED },
        include: {
          fromWallet: { select: { id: true, name: true } },
          toWallet: { select: { id: true, name: true } },
          outTx: true,
        },
      });
    });
  }

  async conversion(walletId: string, dto: ConversionDto, userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    await this.checkTransactAccess(wallet, userId);

    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('errors.sameCurrency');
    }

    if (dto.images && dto.images.length > 15) {
      throw new BadRequestException('errors.tooManyImages');
    }

    // Проверяем баланс исходной валюты
    const balance = await this.prisma.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: dto.fromCurrency } },
    });
    const currentAmount = balance ? Number(balance.amount) : 0;
    if (currentAmount < dto.fromAmount) {
      throw new BadRequestException('errors.insufficientBalance');
    }

    return this.prisma.$transaction(async (tx) => {
      const imageData = dto.images?.length
        ? dto.images.map((url) => ({ url, filename: url.split('/').pop() }))
        : [];

      const walletTx = await tx.walletTx.create({
        data: {
          walletId,
          type: WalletTxType.CONVERSION,
          currency: dto.fromCurrency,
          amount: dto.fromAmount,
          toCurrency: dto.toCurrency,
          toAmount: dto.toAmount,
          rate: dto.rate,
          isCustomRate: dto.isCustomRate ?? false,
          description: dto.description,
          createdById: userId,
          images: imageData.length ? { create: imageData } : undefined,
        },
        include: { images: true },
      });

      // Уменьшаем баланс исходной валюты
      await tx.walletBalance.upsert({
        where: { walletId_currency: { walletId, currency: dto.fromCurrency } },
        create: { walletId, currency: dto.fromCurrency, amount: -dto.fromAmount },
        update: { amount: { decrement: dto.fromAmount } },
      });

      // Увеличиваем баланс целевой валюты
      await tx.walletBalance.upsert({
        where: { walletId_currency: { walletId, currency: dto.toCurrency } },
        create: { walletId, currency: dto.toCurrency, amount: dto.toAmount },
        update: { amount: { increment: dto.toAmount } },
      });

      return walletTx;
    });
  }

  async updateTransaction(txId: string, dto: UpdateTransactionDto, userId: string) {
    const tx = await this.prisma.walletTx.findUnique({
      where: { id: txId },
      include: { wallet: true },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.isClosed) throw new BadRequestException('errors.transactionClosed');

    const perms = await this.getUserPerms(userId);
    // wallets.manage и wallets.edit — редактируют детали любой транзакции
    if (!perms.includes('wallets.manage') && !perms.includes('wallets.edit')) {
      await this.checkTransactAccess(tx.wallet, userId);
    }

    if (dto.images !== undefined && dto.images.length > 15) {
      throw new BadRequestException('errors.tooManyImages');
    }

    return this.prisma.$transaction(async (prismaTx) => {
      // Полная замена изображений, если переданы
      if (dto.images !== undefined) {
        await prismaTx.walletTxImage.deleteMany({ where: { txId } });
        if (dto.images.length > 0) {
          await prismaTx.walletTxImage.createMany({
            data: dto.images.map((url) => ({ txId, url, filename: url.split('/').pop() })),
          });
        }
      }

      return prismaTx.walletTx.update({
        where: { id: txId },
        data: {
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.expenseTypeId !== undefined && { expenseTypeId: dto.expenseTypeId || null }),
        },
        include: {
          images: true,
          expenseType: true,
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          closedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });
  }

  async closeTransaction(txId: string, userId: string) {
    const tx = await this.prisma.walletTx.findUnique({ where: { id: txId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.isClosed) throw new BadRequestException('errors.alreadyClosed');

    return this.prisma.walletTx.update({
      where: { id: txId },
      data: { isClosed: true, closedAt: new Date(), closedById: userId },
    });
  }

  async reopenTransaction(txId: string) {
    const tx = await this.prisma.walletTx.findUnique({ where: { id: txId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (!tx.isClosed) throw new BadRequestException('errors.notClosed');

    return this.prisma.walletTx.update({
      where: { id: txId },
      data: { isClosed: false, closedAt: null, closedById: null },
    });
  }

  // ==================== Сторно (reversal) ====================

  async reverseWalletTransaction(txId: string, userId: string) {
    const original = await this.prisma.walletTx.findUnique({
      where: { id: txId },
      include: { wallet: true, reversedBy: true },
    });
    if (!original) throw new NotFoundException('Transaction not found');
    if (original.isClosed) throw new BadRequestException('errors.transactionClosed');

    // Нельзя сторнировать переводы
    if (original.type === WalletTxType.TRANSFER_OUT || original.type === WalletTxType.TRANSFER_IN) {
      throw new BadRequestException('errors.cannotReverseTransfer');
    }
    if (original.reversedBy) throw new BadRequestException('errors.alreadyReversed');

    await this.checkTransactAccess(original.wallet, userId);

    return this.prisma.$transaction(async (tx) => {
      // Создаём обратную транзакцию с отрицательной суммой
      const reversal = await tx.walletTx.create({
        data: {
          walletId: original.walletId,
          type: original.type,
          currency: original.currency,
          amount: original.amount,
          toCurrency: original.toCurrency,
          toAmount: original.toAmount ? -original.toAmount : null,
          rate: original.rate,
          isCustomRate: original.isCustomRate,
          description: `Сторно: ${txId}`,
          reversalOfId: txId,
          createdById: userId,
        },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          expenseType: true,
        },
      });

      // Корректируем баланс: инвертируем эффект исходной транзакции
      if (original.type === WalletTxType.INCOME) {
        await tx.walletBalance.upsert({
          where: { walletId_currency: { walletId: original.walletId, currency: original.currency } },
          create: { walletId: original.walletId, currency: original.currency, amount: -original.amount },
          update: { amount: { decrement: original.amount } },
        });
      } else if (original.type === WalletTxType.EXPENSE) {
        await tx.walletBalance.upsert({
          where: { walletId_currency: { walletId: original.walletId, currency: original.currency } },
          create: { walletId: original.walletId, currency: original.currency, amount: original.amount },
          update: { amount: { increment: original.amount } },
        });
      } else if (original.type === WalletTxType.CONVERSION && original.toCurrency && original.toAmount) {
        // Возвращаем fromCurrency, снимаем toCurrency
        await tx.walletBalance.upsert({
          where: { walletId_currency: { walletId: original.walletId, currency: original.currency } },
          create: { walletId: original.walletId, currency: original.currency, amount: original.amount },
          update: { amount: { increment: original.amount } },
        });
        await tx.walletBalance.upsert({
          where: { walletId_currency: { walletId: original.walletId, currency: original.toCurrency } },
          create: { walletId: original.walletId, currency: original.toCurrency, amount: -original.toAmount },
          update: { amount: { decrement: original.toAmount } },
        });
      }

      return reversal;
    });
  }

  // ==================== Экспорт транзакций ====================

  async exportTransactions(walletId: string, dto: ExportTransactionsDto, userId: string): Promise<Buffer> {
    const { format = 'xlsx' } = dto;

    // Переиспользуем логику getTransactions (с проверкой доступа)
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    await this.checkViewAccess(wallet, userId);

    const txs = await this.prisma.walletTx.findMany({
      where: { walletId },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        closedBy: { select: { firstName: true, lastName: true } },
        expenseType: { select: { name: true } },
        transferOut: {
          include: { toWallet: { select: { name: true, type: true, trip: { select: { name: true } } } } },
        },
        transferIn: {
          include: { fromWallet: { select: { name: true, type: true, trip: { select: { name: true } } } } },
        },
        images: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Тип транзакции → русское название
    const TYPE_LABELS: Record<string, string> = {
      INCOME: 'Приход',
      EXPENSE: 'Расход',
      TRANSFER_OUT: 'Перевод (исх.)',
      TRANSFER_IN: 'Перевод (вх.)',
      CONVERSION: 'Конвертация',
    };

    // Контрагент: для переводов — имя кошелька, для INCOME/EXPENSE — тип расхода
    const getCounterpart = (tx: any): string => {
      if (tx.type === 'TRANSFER_OUT' && tx.transferOut?.toWallet) {
        const w = tx.transferOut.toWallet;
        return w.trip ? `Выезд: ${w.trip.name}` : (w.name || '—');
      }
      if (tx.type === 'TRANSFER_IN' && tx.transferIn?.fromWallet) {
        const w = tx.transferIn.fromWallet;
        return w.trip ? `Выезд: ${w.trip.name}` : (w.name || '—');
      }
      return tx.expenseType?.name || '—';
    };

    const rows = txs.map((tx: any) => ({
      type: TYPE_LABELS[tx.type] || tx.type,
      amount: Number(tx.amount),
      currency: tx.currency,
      rate: tx.type === 'CONVERSION' ? Number(tx.rate) : null,
      toCurrency: tx.type === 'CONVERSION' ? tx.toCurrency : null,
      toAmount: tx.type === 'CONVERSION' ? Number(tx.toAmount) : null,
      counterpart: getCounterpart(tx),
      description: tx.description || '',
      photos: tx.images?.length ?? 0,
      author: tx.createdBy ? `${tx.createdBy.lastName} ${tx.createdBy.firstName}` : '',
      date: dayjs(tx.createdAt).format('DD.MM.YYYY'),
      status: tx.isClosed ? 'Закрыта' : 'Открыта',
      closedBy: tx.closedBy ? `${tx.closedBy.lastName} ${tx.closedBy.firstName}` : '',
    }));

    const COLUMNS = [
      { key: 'type',        header: 'Тип',              width: 18 },
      { key: 'amount',      header: 'Сумма',             width: 14 },
      { key: 'currency',    header: 'Валюта',            width: 10 },
      { key: 'rate',        header: 'Курс',              width: 12 },
      { key: 'toCurrency',  header: 'Валюта (результат)', width: 18 },
      { key: 'toAmount',    header: 'Сумма (результат)', width: 16 },
      { key: 'counterpart', header: 'Контрагент / тип',  width: 22 },
      { key: 'description', header: 'Описание',          width: 30 },
      { key: 'photos',      header: 'Фото',              width: 8  },
      { key: 'author',      header: 'Автор',             width: 22 },
      { key: 'date',        header: 'Дата',              width: 12 },
      { key: 'status',      header: 'Статус',            width: 12 },
      { key: 'closedBy',    header: 'Закрыл',            width: 22 },
    ];

    if (format === 'csv') {
      const BOM = '\uFEFF';
      const SEP = ';';
      const header = COLUMNS.map((c) => `"${c.header}"`).join(SEP);
      const dataRows = rows.map((r) =>
        COLUMNS.map((c) => {
          const val = r[c.key as keyof typeof r];
          const str = (val === null || val === undefined) ? '' : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        }).join(SEP),
      );
      return Buffer.from(BOM + [header, ...dataRows].join('\r\n'), 'utf-8');
    }

    // Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Транзакции');
    sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    sheet.getRow(1).font = { bold: true };

    for (const r of rows) {
      sheet.addRow(r);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /** Загрузить файл к транзакции (URL из файлового сервиса) */
  async addImage(txId: string, url: string, filename?: string) {
    const tx = await this.prisma.walletTx.findUnique({ where: { id: txId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.isClosed) throw new BadRequestException('errors.transactionClosed');

    const count = await this.prisma.walletTxImage.count({ where: { txId } });
    if (count >= 15) throw new BadRequestException('errors.tooManyImages');

    return this.prisma.walletTxImage.create({ data: { txId, url, filename } });
  }

  async removeImage(imageId: string) {
    const img = await this.prisma.walletTxImage.findUnique({ where: { id: imageId } });
    if (!img) throw new NotFoundException('Image not found');
    return this.prisma.walletTxImage.delete({ where: { id: imageId } });
  }
}

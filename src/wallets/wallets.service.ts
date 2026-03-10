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
import { WalletType, WalletTxType } from '@prisma/client';
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
    // Аудитор и управляющие видят все кошельки без ограничений
    if (perms.includes('wallets.manage') || perms.includes('wallets.view-all') || perms.includes('wallets.auditor')) return;

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

    // PERSONAL: владелец с правом view-person или manage
    if (wallet.type === 'PERSONAL' && wallet.ownerId === userId) return;

    // TRIP: ГА или МВ/ГА в этом выезде
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
    const canAudit = perms.includes('wallets.auditor');
    const canViewPerson = perms.includes('wallets.view-person') || perms.includes('wallets.edit') || perms.includes('wallets.transaction');

    // Аудитор видит все кошельки (но не может совершать транзакции)
    if (canManage || canViewAll || canAudit) {
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
        transferOut: {
          include: { toWallet: { select: { id: true, name: true, type: true, trip: { select: { id: true, name: true } } } } },
        },
        transferIn: {
          include: { fromWallet: { select: { id: true, name: true, type: true, trip: { select: { id: true, name: true } } } } },
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

      // Транзакция исходящая
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

      // Транзакция входящая
      const inTx = await tx.walletTx.create({
        data: {
          walletId: dto.toWalletId,
          type: WalletTxType.TRANSFER_IN,
          currency: dto.currency,
          amount: dto.amount,
          description: dto.description,
          createdById: userId,
        },
      });

      // Связь между транзакциями
      await tx.walletTransfer.create({
        data: {
          fromWalletId: walletId,
          toWalletId: dto.toWalletId,
          outTxId: outTx.id,
          inTxId: inTx.id,
          currency: dto.currency,
          amount: dto.amount,
        },
      });

      // Обновляем балансы
      await tx.walletBalance.upsert({
        where: { walletId_currency: { walletId, currency: dto.currency } },
        create: { walletId, currency: dto.currency, amount: -dto.amount },
        update: { amount: { decrement: dto.amount } },
      });
      await tx.walletBalance.upsert({
        where: { walletId_currency: { walletId: dto.toWalletId, currency: dto.currency } },
        create: { walletId: dto.toWalletId, currency: dto.currency, amount: dto.amount },
        update: { amount: { increment: dto.amount } },
      });

      return outTx;
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
    await this.checkTransactAccess(tx.wallet, userId);

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

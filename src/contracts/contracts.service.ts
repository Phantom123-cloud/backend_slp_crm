import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionType } from '@prisma/client';
import { CreateContractDto, UpdateContractDto, RefundContractDto, AddContractItemDto, UpdateContractItemDto } from './dto/contracts.dto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { StreamableFile } from '@nestjs/common';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // Полный include для договора
  private get fullInclude() {
    return {
      presentation: {
        select: {
          id: true, name: true, number: true, date: true, time: true,
          coordinator: { select: { id: true, firstName: true, lastName: true } },
          crew: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
      trip: {
        select: { id: true, name: true, teamName: true, status: true, warehouse: { select: { id: true } } },
      },
      contractItems: {
        include: { product: true },
        orderBy: { createdAt: 'asc' as const },
      },
      company: { select: { id: true, name: true } },
      speaker: { select: { id: true, firstName: true, lastName: true } },
      signedBy: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      banks: { include: { bank: { include: { conditions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' as const } } } } } },
      phones: { orderBy: { order: 'asc' as const } },
      paymentSchedule: { orderBy: { order: 'asc' as const } },
      files: {
        orderBy: { createdAt: 'asc' as const },
        include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
      },
    };
  }

  /** Генерация номера договора: DDMMYY/NП-SEQ */
  /** Публичная обёртка — для превью номера из контроллера */
  async previewContractNumber(
    presentationId: string,
    contractDate: Date,
    signedById: string,
  ): Promise<string> {
    return this.generateContractNumber(presentationId, contractDate, signedById);
  }

  private async generateContractNumber(
    presentationId: string,
    contractDate: Date,
    signedById: string,
  ): Promise<string> {
    // Загружаем презентацию вместе с типом (для буквы)
    const pres = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      select: {
        type: { select: { letter: true } },
      },
    });
    if (!pres) throw new NotFoundException('errors.presentationNotFound');

    // Загружаем оформляющего (для кода торгового)
    const signer = await this.prisma.user.findUnique({
      where: { id: signedById },
      select: { tradeCode: true },
    });

    // Буква типа презентации (если не задана — пустая строка)
    const letter = pres.type?.letter ?? '';

    // Код торгового, дополненный до 3 цифр (если не задан — 000)
    const tradeCode = signer?.tradeCode
      ? String(signer.tradeCode).padStart(3, '0')
      : '000';

    // Формат даты: DDMMYY
    const d = contractDate;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const datePrefix = `${dd}${mm}${yy}`;

    // Порядковый номер договора этого сотрудника за этот день
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

    const countByPerson = await this.prisma.contract.count({
      where: {
        signedById,
        contractDate: { gte: dayStart, lt: dayEnd },
      },
    });

    const personSeq = String(countByPerson + 1);
    // Итоговый формат: 250326/1П-002
    return `${datePrefix}/${personSeq}${letter}-${tradeCode}`;
  }

  /** Список всех договоров (с фильтром по праву) */
  async findAll(
    userId: string,
    permissions: string[],
    tripId?: string,
  ) {
    const canViewAll = permissions.includes('contracts.view-all');
    const canViewPerson = permissions.includes('contracts.view-person');

    let where: any = {};

    if (tripId) {
      where.tripId = tripId;
    }

    if (!canViewAll) {
      if (canViewPerson) {
        where.signedById = userId;
      } else {
        return [];
      }
    }

    return this.prisma.contract.findMany({
      where,
      include: this.fullInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Получить один договор */
  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: this.fullInclude,
    });
    if (!contract) throw new NotFoundException('errors.contractNotFound');
    return contract;
  }

  /** Создать договор */
  async create(dto: CreateContractDto, userId: string) {
    const contractDate = new Date(dto.contractDate);
    const contractNumber = await this.generateContractNumber(
      dto.presentationId,
      contractDate,
      dto.signedById,
    );

    const {
      bankIds,
      bankAdvances,
      bankConditions,
      phones,
      paymentSchedule,
      items,
      ...rest
    } = dto;

    // Авто-закрытие: если нет графика платежей и авансы покрывают полную сумму
    const bankAdvancesTotal = bankAdvances
      ? Object.values(bankAdvances).reduce((s, v) => s + (Number(v) || 0), 0)
      : Number(dto.advanceBank ?? 0);
    const totalAdvancesAtCreate =
      Number(dto.advanceCash ?? 0) + Number(dto.advanceTerminal ?? 0) + bankAdvancesTotal;
    const autoClose =
      (!paymentSchedule || paymentSchedule.length === 0) &&
      dto.totalAmount != null &&
      totalAdvancesAtCreate >= Number(dto.totalAmount);

    const contract = await this.prisma.contract.create({
      data: {
        ...rest,
        contractNumber,
        contractDate,
        totalAmount: dto.totalAmount,
        advanceCash: dto.advanceCash ?? null,
        advanceTerminal: dto.advanceTerminal ?? null,
        advanceBank: dto.advanceBank ?? null,
        firstPaymentDate: dto.firstPaymentDate ? new Date(dto.firstPaymentDate) : null,
        ...(autoClose ? { paymentStatus: 'CLOSED' } : {}),
        createdById: userId,
        banks: bankIds?.length
          ? {
              create: bankIds.map((bankId) => {
                const cond = bankConditions?.[bankId];
                return {
                  bankId,
                  advance: bankAdvances?.[bankId] ?? null,
                  conditionId: cond?.conditionId ?? null,
                  conditionName: cond?.conditionName ?? null,
                  conditionRate: cond?.conditionRate ?? null,
                };
              }),
            }
          : undefined,
        phones: phones?.length
          ? {
              create: phones.map((p, i) => ({
                countryCode: p.countryCode,
                number: p.number,
                order: i,
              })),
            }
          : undefined,
        paymentSchedule: paymentSchedule?.length
          ? {
              create: paymentSchedule.map((s, i) => ({
                date: new Date(s.date),
                amount: s.amount,
                isPaid: s.isPaid ?? false,
                order: i,
              })),
            }
          : undefined,
      },
      include: this.fullInclude,
    });

    // Добавляем товары к договору, если переданы
    if (items && items.length > 0) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: dto.tripId },
        include: { warehouse: true },
      });
      const warehouse = (trip as any)?.warehouse;
      if (warehouse) {
        for (const item of items) {
          const txType = item.type === 'SALE' ? TransactionType.SALE : TransactionType.GIFT;
          await this.prisma.$transaction(async (tx) => {
            const transaction = await tx.transaction.create({
              data: {
                type: txType,
                fromWarehouseId: warehouse.id,
                note: `Договор ${contract.contractNumber}`,
                createdById: userId,
                items: { create: [{ productId: item.productId, quantity: item.quantity }] },
              },
            });
            await tx.stock.upsert({
              where: { warehouseId_productId: { warehouseId: warehouse.id, productId: item.productId } },
              create: { warehouseId: warehouse.id, productId: item.productId, quantity: -item.quantity },
              update: { quantity: { decrement: item.quantity } },
            });
            await tx.contractItem.create({
              data: {
                contractId: contract.id,
                productId: item.productId,
                quantity: item.quantity,
                type: txType,
                transactionId: transaction.id,
              },
            });
          });
        }
      }
    }

    await this.auditService.log({
      userId,
      action: 'contract.created',
      entity: 'contract',
      entityId: contract.id,
      details: { contractNumber: contract.contractNumber, clientName: dto.clientName },
    });

    return this.prisma.contract.findUnique({
      where: { id: contract.id },
      include: this.fullInclude,
    });
  }

  /** Обновить договор */
  async update(id: string, dto: UpdateContractDto, userId: string) {
    const existing = await this.prisma.contract.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('errors.contractNotFound');

    const {
      bankIds,
      bankAdvances,
      bankConditions,
      phones,
      paymentSchedule,
      contractDate,
      totalAmount,
      advanceCash,
      advanceTerminal,
      advanceBank,
      firstPaymentDate,
      ...rest
    } = dto;

    // Атомарное обновление
    await this.prisma.$transaction(async (tx) => {
      // Обновляем банки если переданы
      if (bankIds !== undefined) {
        await tx.contractBank.deleteMany({ where: { contractId: id } });
        if (bankIds.length > 0) {
          await tx.contractBank.createMany({
            data: bankIds.map((bankId) => {
              const cond = bankConditions?.[bankId];
              return {
                contractId: id,
                bankId,
                advance: bankAdvances?.[bankId] ?? null,
                conditionId: cond?.conditionId ?? null,
                conditionName: cond?.conditionName ?? null,
                conditionRate: cond?.conditionRate ?? null,
              };
            }),
          });
        }
      }

      // Обновляем телефоны если переданы
      if (phones !== undefined) {
        await tx.contractPhone.deleteMany({ where: { contractId: id } });
        if (phones.length > 0) {
          await tx.contractPhone.createMany({
            data: phones.map((p, i) => ({
              contractId: id,
              countryCode: p.countryCode,
              number: p.number,
              order: i,
            })),
          });
        }
      }

      // Обновляем график платежей если передан
      if (paymentSchedule !== undefined) {
        await tx.contractPaymentSchedule.deleteMany({ where: { contractId: id } });
        if (paymentSchedule.length > 0) {
          await tx.contractPaymentSchedule.createMany({
            data: paymentSchedule.map((s, i) => ({
              contractId: id,
              date: new Date(s.date),
              amount: s.amount,
              isPaid: s.isPaid ?? false,
              order: i,
            })),
          });
        }
      }

      // Обновляем основные данные
      await tx.contract.update({
        where: { id },
        data: {
          ...rest,
          ...(contractDate ? { contractDate: new Date(contractDate) } : {}),
          ...(totalAmount !== undefined ? { totalAmount } : {}),
          ...(advanceCash !== undefined ? { advanceCash: advanceCash ?? null } : {}),
          ...(advanceTerminal !== undefined ? { advanceTerminal: advanceTerminal ?? null } : {}),
          ...(advanceBank !== undefined ? { advanceBank: advanceBank ?? null } : {}),
          ...(firstPaymentDate !== undefined
            ? { firstPaymentDate: firstPaymentDate ? new Date(firstPaymentDate) : null }
            : {}),
        },
      });
    });

    await this.auditService.log({
      userId,
      action: 'contract.updated',
      entity: 'contract',
      entityId: id,
      details: rest,
    });

    return this.findOne(id);
  }

  /** Оформить возврат или частичный возврат */
  async refund(id: string, dto: RefundContractDto, userId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: { banks: true },
    });
    if (!contract) throw new NotFoundException('errors.contractNotFound');

    const { paymentStatus, advanceCash, advanceTerminal, advanceBank, bankAdvances, amountAfterRefund } = dto;

    await this.prisma.$transaction(async (tx) => {
      // Обновляем авансы по банкам если переданы
      if (bankAdvances !== undefined) {
        for (const [bankId, advance] of Object.entries(bankAdvances)) {
          await tx.contractBank.updateMany({
            where: { contractId: id, bankId },
            data: { advance },
          });
        }
      }

      await tx.contract.update({
        where: { id },
        data: {
          paymentStatus: paymentStatus as any,
          advanceCash: advanceCash ?? null,
          advanceTerminal: advanceTerminal ?? null,
          advanceBank: advanceBank ?? null,
          amountAfterRefund: amountAfterRefund ?? null,
        },
      });
    });

    await this.auditService.log({
      userId,
      action: 'contract.refund',
      entity: 'contract',
      entityId: id,
      details: { paymentStatus },
    });

    return this.findOne(id);
  }

  /** Обновить финансовые данные (→ PARTIAL_REFUND) */
  async updateFinancials(id: string, dto: UpdateContractDto, userId: string) {
    const existing = await this.prisma.contract.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('errors.contractNotFound');

    // totalAmount вырезаем из rest — в updateFinancials оно идёт в amountAfterRefund, сам totalAmount не меняем
    const { bankIds, bankAdvances, bankConditions, phones, paymentSchedule, totalAmount, advanceCash, advanceTerminal, advanceBank, firstPaymentDate, installmentMonths, ...rest } = dto;

    // Вычисляем значения заранее — нужны и внутри транзакции, и в аудит-логе
    const hasInstallment =
      (dto.paymentType === 'COMPANY' || dto.paymentType === 'MIXED') &&
      dto.installmentMonths &&
      paymentSchedule && paymentSchedule.length > 0;

    const newAdvanceCash = Number(advanceCash ?? 0);
    const newAdvanceTerminal = Number(advanceTerminal ?? 0);
    const bankAdvancesTotal = bankAdvances
      ? Object.values(bankAdvances).reduce((sum, v) => sum + (Number(v) || 0), 0)
      : Number(advanceBank ?? 0);
    const totalAdvances = newAdvanceCash + newAdvanceTerminal + bankAdvancesTotal;
    const computedAmountAfterRefund = hasInstallment
      ? (totalAmount ?? existing.totalAmount)
      : totalAdvances;

    const isPartialRefund = Number(computedAmountAfterRefund) < Number(existing.totalAmount);
    const autoCloseFinancials =
      !isPartialRefund &&
      !hasInstallment &&
      totalAdvances >= Number(existing.totalAmount);
    const newPaymentStatus = isPartialRefund ? 'PARTIAL_REFUND' : autoCloseFinancials ? 'CLOSED' : 'OPEN';

    await this.prisma.$transaction(async (tx) => {
      // Обновляем банки если переданы
      if (bankIds !== undefined) {
        await tx.contractBank.deleteMany({ where: { contractId: id } });
        if (bankIds.length > 0) {
          await tx.contractBank.createMany({
            data: bankIds.map((bankId) => {
              const cond = bankConditions?.[bankId];
              return {
                contractId: id,
                bankId,
                advance: bankAdvances?.[bankId] ?? null,
                conditionId: cond?.conditionId ?? null,
                conditionName: cond?.conditionName ?? null,
                conditionRate: cond?.conditionRate ?? null,
              };
            }),
          });
        }
      }

      // Всегда пересоздаём график платежей (пустой массив = удалить)
      await tx.contractPaymentSchedule.deleteMany({ where: { contractId: id } });
      if (paymentSchedule && paymentSchedule.length > 0) {
        await tx.contractPaymentSchedule.createMany({
          data: paymentSchedule.map((s, i) => ({
            contractId: id,
            date: new Date(s.date),
            amount: s.amount,
            isPaid: s.isPaid ?? false,
            order: i,
          })),
        });
      }

      await tx.contract.update({
        where: { id },
        data: {
          ...rest, // paymentType, saleType и др. — без totalAmount (деструктурирован выше)
          paymentStatus: isPartialRefund ? 'PARTIAL_REFUND' : autoCloseFinancials ? 'CLOSED' : 'OPEN',
          // totalAmount НЕ обновляем — исходная сумма договора (до возврата)
          amountAfterRefund: computedAmountAfterRefund,
          advanceCash: advanceCash ?? null,
          advanceTerminal: advanceTerminal ?? null,
          // advanceBank = сумма per-bank авансов, чтобы поле оставалось актуальным
          advanceBank: bankAdvancesTotal > 0 ? bankAdvancesTotal : (advanceBank ?? null),
          // Обнуляем рассрочку если тип оплаты не предполагает её
          installmentMonths: hasInstallment ? installmentMonths : null,
          firstPaymentDate: hasInstallment && firstPaymentDate
            ? new Date(firstPaymentDate)
            : null,
        },
      });
    });

    await this.auditService.log({
      userId,
      action: 'contract.financialsUpdated',
      entity: 'contract',
      entityId: id,
      details: {
        before: {
          amountAfterRefund: Number(existing.amountAfterRefund ?? existing.totalAmount),
          advanceCash: Number(existing.advanceCash ?? 0),
          advanceTerminal: Number(existing.advanceTerminal ?? 0),
          advanceBank: Number(existing.advanceBank ?? 0),
          paymentStatus: existing.paymentStatus,
        },
        after: {
          amountAfterRefund: Number(computedAmountAfterRefund),
          advanceCash: Number(advanceCash ?? 0),
          advanceTerminal: Number(advanceTerminal ?? 0),
          advanceBank: Number(bankAdvancesTotal > 0 ? bankAdvancesTotal : (advanceBank ?? 0)),
          paymentStatus: newPaymentStatus,
        },
      },
    });

    return this.findOne(id);
  }

  /** Сменить статус (verify/unverify/cancel) */
  async updateStatus(id: string, status: string, userId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('errors.contractNotFound');

    // Нельзя отменить верификацию если по договору уже проводились финансовые операции
    if (status === 'UNVERIFIED' && contract.paymentStatus !== 'OPEN') {
      throw new BadRequestException(
        'Нельзя отменить верификацию: по договору уже проводились финансовые операции.',
      );
    }

    // Для верификации обязательно наличие хотя бы одного файла
    if (status === 'VERIFIED') {
      const fileCount = await this.prisma.contractFile.count({ where: { contractId: id } });
      if (fileCount === 0) {
        throw new BadRequestException(
          'Невозможно верифицировать договор без вложений. Загрузите хотя бы один файл.',
        );
      }
    }

    const updated = await this.prisma.contract.update({
      where: { id },
      data: { status: status as any },
      include: this.fullInclude,
    });

    await this.auditService.log({
      userId,
      action: 'contract.statusChanged',
      entity: 'contract',
      entityId: id,
      details: { from: contract.status, to: status },
    });

    return updated;
  }

  /** Подтвердить платёж по графику рассрочки */
  async payScheduleItem(scheduleItemId: string, userId: string) {
    const item = await this.prisma.contractPaymentSchedule.findUnique({
      where: { id: scheduleItemId },
    });
    if (!item) throw new NotFoundException('errors.scheduleItemNotFound');

    await this.prisma.$transaction(async (tx) => {
      await tx.contractPaymentSchedule.update({
        where: { id: scheduleItemId },
        data: { isPaid: true },
      });

      // Авто-закрытие: если все платежи по графику оплачены — переводим договор в CLOSED
      const remaining = await tx.contractPaymentSchedule.count({
        where: { contractId: item.contractId, isPaid: false, id: { not: scheduleItemId } },
      });
      if (remaining === 0) {
        await tx.contract.update({
          where: { id: item.contractId },
          data: { paymentStatus: 'CLOSED' },
        });
      }
    });

    await this.auditService.log({
      userId,
      action: 'contract.scheduleItemPaid',
      entity: 'contract',
      entityId: item.contractId,
      details: { scheduleItemId, date: item.date, amount: item.amount },
    });

    return this.findOne(item.contractId);
  }

  /** Отменить подтверждение платежа по графику */
  async unpayScheduleItem(scheduleItemId: string, userId: string) {
    const item = await this.prisma.contractPaymentSchedule.findUnique({
      where: { id: scheduleItemId },
    });
    if (!item) throw new NotFoundException('errors.scheduleItemNotFound');

    await this.prisma.$transaction(async (tx) => {
      await tx.contractPaymentSchedule.update({
        where: { id: scheduleItemId },
        data: { isPaid: false },
      });

      // Если договор был CLOSED — откатываем обратно в OPEN
      const contract = await tx.contract.findUnique({
        where: { id: item.contractId },
        select: { paymentStatus: true },
      });
      if (contract?.paymentStatus === 'CLOSED') {
        await tx.contract.update({
          where: { id: item.contractId },
          data: { paymentStatus: 'OPEN' },
        });
      }
    });

    await this.auditService.log({
      userId,
      action: 'contract.scheduleItemUnpaid',
      entity: 'contract',
      entityId: item.contractId,
      details: { scheduleItemId, date: item.date, amount: item.amount },
    });

    return this.findOne(item.contractId);
  }

  /** Загрузить файл к договору */
  async uploadFile(contractId: string, file: Express.Multer.File, userId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('errors.contractNotFound');

    // Лимит 15 файлов
    const count = await this.prisma.contractFile.count({ where: { contractId } });
    if (count >= 15) throw new BadRequestException('Максимум 15 файлов на договор.');

    // Только изображения и PDF
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Разрешены только изображения и PDF.');
    }

    // Сохраняем файл на диск
    const dir = path.join('./uploads', 'contracts', contractId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const ext = path.extname(file.originalname);
    const savedName = `${uuid()}${ext}`;
    const filePath = path.join(dir, savedName);
    fs.writeFileSync(filePath, file.buffer);

    const doc = await this.prisma.contractFile.create({
      data: {
        contractId,
        fileName: file.originalname,
        filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById: userId,
      },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.auditService.log({
      userId,
      action: 'contract.fileUploaded',
      entity: 'contract',
      entityId: contractId,
      details: { fileName: file.originalname, fileSize: file.size },
    });

    return doc;
  }

  /** Удалить файл договора */
  async deleteFile(fileId: string, userId: string) {
    const doc = await this.prisma.contractFile.findUnique({ where: { id: fileId } });
    if (!doc) throw new NotFoundException('errors.fileNotFound');

    if (fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath);
    await this.prisma.contractFile.delete({ where: { id: fileId } });

    await this.auditService.log({
      userId,
      action: 'contract.fileDeleted',
      entity: 'contract',
      entityId: doc.contractId,
      details: { fileName: doc.fileName },
    });
  }

  /** Скачать/показать файл договора */
  async downloadFile(fileId: string) {
    const doc = await this.prisma.contractFile.findUnique({ where: { id: fileId } });
    if (!doc) throw new NotFoundException('errors.fileNotFound');
    if (!fs.existsSync(doc.filePath)) throw new NotFoundException('errors.fileNotFoundOnDisk');

    const stream = fs.createReadStream(doc.filePath);
    return { stream: new StreamableFile(stream), fileName: doc.fileName, mimeType: doc.mimeType };
  }

  /** Обновить кол-во товара в договоре → корректирующая транзакция в складе */
  async updateItem(contractId: string, itemId: string, dto: UpdateContractItemDto, userId: string) {
    const item = await this.prisma.contractItem.findUnique({
      where: { id: itemId },
      include: { transaction: { include: { items: true } } },
    });
    if (!item || item.contractId !== contractId) throw new NotFoundException('errors.contractItemNotFound');

    const oldQty = Number(item.quantity);
    const newQty = dto.quantity;
    const delta = newQty - oldQty; // > 0 — нужно взять больше, < 0 — вернуть разницу

    if (Math.abs(delta) < 0.001) {
      return this.prisma.contract.findUnique({ where: { id: contractId }, include: this.fullInclude });
    }

    const warehouseId = item.transaction?.fromWarehouseId;
    if (!warehouseId) throw new BadRequestException('errors.noWarehouseOnTransaction');

    // Загружаем договор для номера и статуса выезда
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { trip: { select: { status: true } } },
    });
    const contractNumber = (contract as any)?.contractNumber ?? contractId;

    // Определяем склад для операции
    let targetWarehouseId = warehouseId;
    if (delta < 0) {
      // Возврат товара: если выезд закрыт или склад неактивен — нужен returnWarehouseId
      const tripClosed = contract?.trip?.status === 'CLOSED';
      const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
      const warehouseInactive = warehouse ? !warehouse.isActive : false;
      if (tripClosed || warehouseInactive) {
        if (!dto.returnWarehouseId) throw new BadRequestException('errors.warehouseInactiveNeedReturn');
        targetWarehouseId = dto.returnWarehouseId;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (delta > 0) {
        // Берём больше из склада выезда
        await tx.transaction.create({
          data: {
            type: item.type,
            fromWarehouseId: warehouseId,
            note: `Актуализация к-ва по договору ${contractNumber}`,
            createdById: userId,
            items: { create: [{ productId: item.productId, quantity: delta }] },
          },
        });
        await tx.stock.upsert({
          where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          create: { warehouseId, productId: item.productId, quantity: -delta },
          update: { quantity: { decrement: delta } },
        });
      } else {
        // Возвращаем |delta| на целевой склад
        const absDelta = Math.abs(delta);
        const isReturn = targetWarehouseId !== warehouseId;
        await tx.transaction.create({
          data: {
            type: TransactionType.INCOMING,
            toWarehouseId: targetWarehouseId,
            note: isReturn
              ? `Актуализация к-ва договора ${contractNumber} (возврат на склад)`
              : `Актуализация к-ва договора ${contractNumber}`,
            createdById: userId,
            items: { create: [{ productId: item.productId, quantity: absDelta }] },
          },
        });
        await tx.stock.upsert({
          where: { warehouseId_productId: { warehouseId: targetWarehouseId, productId: item.productId } },
          create: { warehouseId: targetWarehouseId, productId: item.productId, quantity: absDelta },
          update: { quantity: { increment: absDelta } },
        });
      }

      await tx.contractItem.update({
        where: { id: itemId },
        data: { quantity: newQty },
      });
    });

    return this.prisma.contract.findUnique({ where: { id: contractId }, include: this.fullInclude });
  }

  /** Добавить товар к договору → создаёт транзакцию в складе выезда (или sourceWarehouseId если выезд закрыт) */
  async addItem(contractId: string, dto: AddContractItemDto, userId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { trip: { include: { warehouse: true } } },
    });
    if (!contract) throw new NotFoundException('errors.contractNotFound');

    const tripWarehouse = (contract.trip as any)?.warehouse;
    if (!tripWarehouse) throw new BadRequestException('errors.tripHasNoWarehouse');

    // Если выезд закрыт — нужен sourceWarehouseId
    const tripClosed = (contract.trip as any)?.status === 'CLOSED';
    if (tripClosed && !dto.sourceWarehouseId) {
      throw new BadRequestException('errors.warehouseInactiveNeedSource');
    }

    const sourceWarehouseId = (tripClosed && dto.sourceWarehouseId) ? dto.sourceWarehouseId : tripWarehouse.id;
    const txType = dto.type === 'SALE' ? TransactionType.SALE : TransactionType.GIFT;

    await this.prisma.$transaction(async (tx) => {
      // Создаём транзакцию в складе (без ограничения 5 — это договорная)
      const transaction = await tx.transaction.create({
        data: {
          type: txType,
          fromWarehouseId: sourceWarehouseId,
          note: `Договор ${contract.contractNumber}`,
          createdById: userId,
          items: {
            create: [{ productId: dto.productId, quantity: dto.quantity }],
          },
        },
      });

      // Обновляем остаток (может уйти в минус)
      await tx.stock.upsert({
        where: { warehouseId_productId: { warehouseId: sourceWarehouseId, productId: dto.productId } },
        create: { warehouseId: sourceWarehouseId, productId: dto.productId, quantity: -dto.quantity },
        update: { quantity: { decrement: dto.quantity } },
      });

      // Создаём запись товара в договоре
      await tx.contractItem.create({
        data: {
          contractId,
          productId: dto.productId,
          quantity: dto.quantity,
          type: txType,
          transactionId: transaction.id,
        },
      });
    });

    return this.prisma.contract.findUnique({
      where: { id: contractId },
      include: this.fullInclude,
    });
  }

  /** Удалить товар из договора → сторно транзакции в складе */
  async removeItem(contractId: string, itemId: string, userId: string) {
    const item = await this.prisma.contractItem.findUnique({
      where: { id: itemId },
      include: {
        transaction: { include: { items: true } },
      },
    });
    if (!item || item.contractId !== contractId) throw new NotFoundException('errors.contractItemNotFound');

    await this.prisma.$transaction(async (tx) => {
      const transaction = item.transaction;
      if (transaction && transaction.fromWarehouseId) {
        const warehouseId = transaction.fromWarehouseId;

        // Создаём сторно транзакцию
        await tx.transaction.create({
          data: {
            type: TransactionType.REVERSAL,
            fromWarehouseId: warehouseId,
            reversalOfId: transaction.id,
            note: `Сторно по договору ${contractId}`,
            createdById: userId,
            items: {
              create: transaction.items.map((i) => ({
                productId: i.productId,
                quantity: -Number(i.quantity),
              })),
            },
          },
        });

        // Возвращаем остаток
        for (const i of transaction.items) {
          await tx.stock.upsert({
            where: { warehouseId_productId: { warehouseId, productId: i.productId } },
            create: { warehouseId, productId: i.productId, quantity: Number(i.quantity) },
            update: { quantity: { increment: Number(i.quantity) } },
          });
        }
      }

      await tx.contractItem.delete({ where: { id: itemId } });
    });

    return this.prisma.contract.findUnique({
      where: { id: contractId },
      include: this.fullInclude,
    });
  }

  /** Удалить договор */
  async delete(id: string, userId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('errors.contractNotFound');

    await this.prisma.contract.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'contract.deleted',
      entity: 'contract',
      entityId: id,
    });
  }
}

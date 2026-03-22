import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateContractDto, UpdateContractDto, RefundContractDto } from './dto/contracts.dto';

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
        select: { id: true, name: true, number: true, date: true, time: true },
      },
      trip: {
        select: { id: true, name: true, teamName: true },
      },
      company: { select: { id: true, name: true } },
      speaker: { select: { id: true, firstName: true, lastName: true } },
      signedBy: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      banks: { include: { bank: { select: { id: true, name: true } } } },
      phones: { orderBy: { order: 'asc' as const } },
      paymentSchedule: { orderBy: { order: 'asc' as const } },
    };
  }

  /** Генерация номера договора: DDMMYY/NП-SEQ */
  private async generateContractNumber(
    presentationId: string,
    contractDate: Date,
  ): Promise<string> {
    const pres = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      select: { number: true },
    });
    if (!pres) throw new NotFoundException('errors.presentationNotFound');

    // Формат даты
    const d = contractDate;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const datePrefix = `${dd}${mm}${yy}`;

    // Порядковый номер за этот день
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

    const countToday = await this.prisma.contract.count({
      where: {
        contractDate: { gte: dayStart, lt: dayEnd },
      },
    });

    const seq = String(countToday + 1).padStart(3, '0');
    return `${datePrefix}/${pres.number}П-${seq}`;
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
    );

    const {
      bankIds,
      bankAdvances,
      phones,
      paymentSchedule,
      ...rest
    } = dto;

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
        createdById: userId,
        banks: bankIds?.length
          ? { create: bankIds.map((bankId) => ({ bankId, advance: bankAdvances?.[bankId] ?? null })) }
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

    await this.auditService.log({
      userId,
      action: 'contract.created',
      entity: 'contract',
      entityId: contract.id,
      details: { contractNumber: contract.contractNumber, clientName: dto.clientName },
    });

    return contract;
  }

  /** Обновить договор */
  async update(id: string, dto: UpdateContractDto, userId: string) {
    const existing = await this.prisma.contract.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('errors.contractNotFound');

    const {
      bankIds,
      bankAdvances,
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
            data: bankIds.map((bankId) => ({ contractId: id, bankId, advance: bankAdvances?.[bankId] ?? null })),
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

    const { bankIds, bankAdvances, phones, paymentSchedule, ...rest } = dto;

    await this.prisma.$transaction(async (tx) => {
      // Обновляем банки если переданы
      if (bankIds !== undefined) {
        await tx.contractBank.deleteMany({ where: { contractId: id } });
        if (bankIds.length > 0) {
          await tx.contractBank.createMany({
            data: bankIds.map((bankId) => ({
              contractId: id,
              bankId,
              advance: bankAdvances?.[bankId] ?? null,
            })),
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

      const hasInstallment =
        (dto.paymentType === 'COMPANY' || dto.paymentType === 'MIXED') &&
        dto.installmentMonths;

      await tx.contract.update({
        where: { id },
        data: {
          ...rest,
          paymentStatus: 'PARTIAL_REFUND',
          ...(dto.totalAmount !== undefined ? { totalAmount: dto.totalAmount } : {}),
          ...(dto.advanceCash !== undefined ? { advanceCash: dto.advanceCash ?? null } : {}),
          ...(dto.advanceTerminal !== undefined ? { advanceTerminal: dto.advanceTerminal ?? null } : {}),
          ...(dto.advanceBank !== undefined ? { advanceBank: dto.advanceBank ?? null } : {}),
          // Обнуляем рассрочку если тип оплаты не предполагает её
          installmentMonths: hasInstallment ? dto.installmentMonths : null,
          firstPaymentDate: hasInstallment && dto.firstPaymentDate
            ? new Date(dto.firstPaymentDate)
            : null,
          amountAfterRefund: dto.totalAmount ?? existing.totalAmount,
        },
      });
    });

    await this.auditService.log({
      userId,
      action: 'contract.financialsUpdated',
      entity: 'contract',
      entityId: id,
      details: rest,
    });

    return this.findOne(id);
  }

  /** Сменить статус (verify/unverify/cancel) */
  async updateStatus(id: string, status: string, userId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('errors.contractNotFound');

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
      details: { status },
    });

    return updated;
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

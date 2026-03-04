import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import dayjs from 'dayjs';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId?: string;
    action: string;
    entity: string;
    entityId?: string;
    details?: any;
    ip?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        details: params.details,
        ip: params.ip,
      },
    });
  }

  private buildWhere(params: {
    entity?: string;
    entityId?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    const where: any = {};
    if (params.entity) where.entity = params.entity;
    if (params.entityId) where.entityId = params.entityId;
    if (params.userId) where.userId = params.userId;
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = params.dateFrom;
      if (params.dateTo) where.createdAt.lte = params.dateTo;
    }
    return where;
  }

  async findAll(params: {
    entity?: string;
    entityId?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = params;
    const where = this.buildWhere(params);

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async exportLogs(params: {
    entity?: string;
    entityId?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    format?: 'xlsx' | 'csv';
    scope?: 'page' | 'all';
    page?: number;
    limit?: number;
  }): Promise<Buffer> {
    const { format = 'xlsx', scope = 'all', page = 1, limit = 20 } = params;
    const where = this.buildWhere(params);

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(scope === 'page' && { skip: (page - 1) * limit, take: limit }),
    });

    const fields = [
      {
        header: 'Дата',
        key: 'date',
        getValue: (l: any) => dayjs(l.createdAt).format('DD.MM.YYYY HH:mm:ss'),
      },
      {
        header: 'Пользователь',
        key: 'user',
        getValue: (l: any) =>
          l.user ? `${l.user.lastName} ${l.user.firstName}` : '—',
      },
      {
        header: 'Email',
        key: 'email',
        getValue: (l: any) => l.user?.email || '—',
      },
      {
        header: 'Действие',
        key: 'action',
        getValue: (l: any) => l.action || '',
      },
      {
        header: 'Сущность',
        key: 'entity',
        getValue: (l: any) => l.entity || '',
      },
      {
        header: 'ID сущности',
        key: 'entityId',
        getValue: (l: any) => l.entityId || '',
      },
      { header: 'IP', key: 'ip', getValue: (l: any) => l.ip || '' },
      {
        header: 'Детали',
        key: 'details',
        getValue: (l: any) =>
          l.details ? JSON.stringify(l.details, null, 0) : '',
      },
    ];

    if (format === 'csv') {
      return this.generateAuditCsv(logs, fields);
    }
    return this.generateAuditXlsx(logs, fields);
  }

  private async generateAuditXlsx(
    logs: any[],
    fields: { header: string; key: string; getValue: (l: any) => string }[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Журнал действий');

    sheet.columns = fields.map((f) => ({
      header: f.header,
      key: f.key,
      width: f.key === 'details' ? 50 : 25,
    }));

    sheet.getRow(1).font = { bold: true };

    for (const log of logs) {
      const row: Record<string, any> = {};
      for (const f of fields) {
        row[f.key] = f.getValue(log);
      }
      sheet.addRow(row);
    }

    // wrapText для деталей
    sheet.getColumn('details').eachCell((cell) => {
      cell.alignment = { wrapText: true, vertical: 'top' };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private generateAuditCsv(
    logs: any[],
    fields: { header: string; key: string; getValue: (l: any) => string }[],
  ): Buffer {
    const BOM = '\uFEFF';
    const SEP = ';';

    const header = fields.map((f) => `"${f.header}"`).join(SEP);
    const rows = logs.map((log) =>
      fields
        .map((f) => {
          const val = f.getValue(log).replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(SEP),
    );

    const csv = BOM + [header, ...rows].join('\r\n');
    return Buffer.from(csv, 'utf-8');
  }
}

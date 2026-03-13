import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Readable } from 'stream';

// ────────────────────────────────────────────────────────────────────────────
// Вспомогательные типы
// ────────────────────────────────────────────────────────────────────────────

interface CsvRow {
  fullName: string;
  phone: string;
  date: string; // "DD.MM.YYYY" или "YYYY-MM-DD"
  time: string; // "HH:MM"
}

interface FailedRow extends CsvRow {
  error: string;
}

@Injectable()
export class GuestListsService {
  constructor(private prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Парсинг CSV
  // ──────────────────────────────────────────────────────────────────────────

  /** Разбираем буфер CSV в массив строк, пропуская заголовок */
  private parseCsv(buffer: Buffer): CsvRow[] {
    const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length === 0) return [];

    // Определяем есть ли заголовок — первая строка не должна быть "телефоном"
    const firstCell = lines[0].split(',')[0].trim().toLowerCase();
    const hasHeader =
      isNaN(Number(firstCell)) && !firstCell.match(/^\d{6,}/);

    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines
      .map((line) => {
        const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        return {
          fullName: cols[0] ?? '',
          phone: cols[1] ?? '',
          date: cols[2] ?? '',
          time: cols[3] ?? '',
        };
      })
      .filter((r) => r.phone); // строки без номера пропускаем
  }

  /** Нормализует дату в формат YYYY-MM-DD */
  private normalizeDate(raw: string): string | null {
    if (!raw) return null;
    // DD.MM.YYYY
    const dmyMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return null;
  }

  /** Нормализует время в формат HH:MM */
  private normalizeTime(raw: string): string | null {
    if (!raw) return null;
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Импорт CSV
  // ──────────────────────────────────────────────────────────────────────────

  async importGuestList(
    tripId: string,
    presentationId: string | undefined,
    fileName: string,
    buffer: Buffer,
    userId: string,
  ) {
    // 1. Получаем все презентации выезда (дата + время)
    const presentations = await this.prisma.presentation.findMany({
      where: { tripId },
      select: { id: true, date: true, time: true },
    });

    if (presentations.length === 0) {
      throw new BadRequestException('У выезда нет презентаций для привязки');
    }

    // Строим быструю Map: "YYYY-MM-DD|HH:MM" → presentationId
    const presMap = new Map<string, string>();
    for (const p of presentations) {
      const dateKey = p.date.toISOString().split('T')[0]; // UTC дата
      presMap.set(`${dateKey}|${p.time}`, p.id);
    }

    // 2. Парсим CSV
    const rows = this.parseCsv(buffer);
    if (rows.length === 0) {
      throw new BadRequestException('Файл пустой или не содержит данных');
    }

    const validRecords: { fullName: string; phone: string; presentationId: string }[] = [];
    const failedRows: FailedRow[] = [];

    for (const row of rows) {
      const normDate = this.normalizeDate(row.date);
      const normTime = this.normalizeTime(row.time);

      if (!normDate) {
        failedRows.push({ ...row, error: 'Неверный формат даты (ожидается DD.MM.YYYY или YYYY-MM-DD)' });
        continue;
      }
      if (!normTime) {
        failedRows.push({ ...row, error: 'Неверный формат времени (ожидается HH:MM)' });
        continue;
      }

      const key = `${normDate}|${normTime}`;
      const matchedPresId = presMap.get(key);

      if (!matchedPresId) {
        failedRows.push({ ...row, error: `Презентация ${row.date} ${row.time} не найдена в выезде` });
        continue;
      }

      validRecords.push({
        fullName: row.fullName || '',
        phone: row.phone,
        presentationId: matchedPresId,
      });
    }

    // 3. Создаём GuestList + GuestRecord в транзакции
    const guestList = await this.prisma.$transaction(async (tx) => {
      const gl = await tx.guestList.create({
        data: {
          tripId,
          presentationId: presentationId ?? null,
          fileName,
          totalCount: rows.length,
          importedCount: validRecords.length,
          failedCount: failedRows.length,
          createdById: userId,
          guests: {
            create: validRecords,
          },
        },
        include: { presentation: { select: { id: true, name: true, date: true, time: true } } },
      });

      // Лог
      await tx.guestImportLog.create({
        data: {
          tripId,
          guestListId: gl.id,
          action: 'IMPORT',
          fileName,
          totalCount: rows.length,
          importedCount: validRecords.length,
          failedCount: failedRows.length,
          createdById: userId,
        },
      });

      return gl;
    });

    // 4. Генерируем CSV с ошибками (если есть)
    let errorCsv: string | null = null;
    if (failedRows.length > 0) {
      const header = 'ФИО,Номер,Дата,Время,Причина ошибки';
      const dataLines = failedRows.map(
        (r) =>
          `"${r.fullName}","${r.phone}","${r.date}","${r.time}","${r.error}"`,
      );
      errorCsv = [header, ...dataLines].join('\n');
    }

    return {
      guestList,
      importedCount: validRecords.length,
      failedCount: failedRows.length,
      totalCount: rows.length,
      errorCsv, // строка CSV для скачивания на фронте
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Получение списков выезда
  // ──────────────────────────────────────────────────────────────────────────

  async getGuestLists(tripId: string) {
    return this.prisma.guestList.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      include: {
        presentation: { select: { id: true, name: true, date: true, time: true, status: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { guests: true } },
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Детали списка с гостями
  // ──────────────────────────────────────────────────────────────────────────

  async getGuestListById(id: string) {
    const gl = await this.prisma.guestList.findUnique({
      where: { id },
      include: {
        presentation: { select: { id: true, name: true, date: true, time: true, status: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        guests: {
          orderBy: { createdAt: 'asc' },
          include: {
            presentation: { select: { id: true, name: true, date: true, time: true } },
          },
        },
      },
    });
    if (!gl) throw new NotFoundException('Список гостей не найден');
    return gl;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Удаление одной записи гостя
  // ──────────────────────────────────────────────────────────────────────────

  async deleteGuestRecord(guestListId: string, recordId: string) {
    const record = await this.prisma.guestRecord.findFirst({
      where: { id: recordId, guestListId },
    });
    if (!record) throw new NotFoundException('Запись не найдена');
    await this.prisma.guestRecord.delete({ where: { id: recordId } });
    // Обновляем счётчик
    await this.prisma.guestList.update({
      where: { id: guestListId },
      data: { importedCount: { decrement: 1 } },
    });
    return { success: true };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Удаление по файлу с номерами
  // ──────────────────────────────────────────────────────────────────────────

  async deleteByFile(
    guestListId: string,
    fileName: string,
    buffer: Buffer,
    userId: string,
  ) {
    const gl = await this.prisma.guestList.findUnique({ where: { id: guestListId } });
    if (!gl) throw new NotFoundException('Список гостей не найден');

    // Парсим файл: одна строка — один номер (без заголовка)
    const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const phones = text
      .split('\n')
      .map((l) => l.split(',')[0].trim().replace(/^"|"$/g, ''))
      .filter(Boolean);

    if (phones.length === 0) {
      throw new BadRequestException('Файл не содержит номеров');
    }

    // Находим и удаляем совпадающие записи
    const deleted = await this.prisma.guestRecord.deleteMany({
      where: { guestListId, phone: { in: phones } },
    });

    // Обновляем счётчик
    if (deleted.count > 0) {
      await this.prisma.guestList.update({
        where: { id: guestListId },
        data: { importedCount: { decrement: deleted.count } },
      });
    }

    // Лог операции
    await this.prisma.guestImportLog.create({
      data: {
        tripId: gl.tripId,
        guestListId,
        action: 'DELETE_BY_FILE',
        fileName,
        totalCount: phones.length,
        importedCount: deleted.count,
        failedCount: phones.length - deleted.count,
        createdById: userId,
      },
    });

    return { deletedCount: deleted.count, totalInFile: phones.length };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // История импортов выезда
  // ──────────────────────────────────────────────────────────────────────────

  async getImportLogs(tripId: string) {
    return this.prisma.guestImportLog.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        guestList: { select: { id: true, fileName: true } },
      },
    });
  }
}

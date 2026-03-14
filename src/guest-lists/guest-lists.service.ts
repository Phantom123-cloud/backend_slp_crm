import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { IsString, IsInt, IsOptional, MaxLength, IsNumber } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

// ────────────────────────────────────────────────────────────────────────────
// Вспомогательные типы
// ────────────────────────────────────────────────────────────────────────────

interface CsvRow {
  fullName: string;
  couponNumber: string;
  phone: string;
  phone2: string;
  phone3: string;
  guestsCount: string;
  pairsCount: string;
  passportCount: string;
  age: string;
  insteadOf: string;
  guestFullName: string;
  guestPhone: string;
  leftStatus: string;
  leftReason: string;
  notes: string;
  presentationNumber: string;
  time: string;
  date: string;
}

interface FailedRow {
  fullName: string;
  phone: string;
  date: string;
  time: string;
  error: string;
}

// DTO для создания записи гостя вручную
export class CreateGuestRecordDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() couponNumber?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() phone2?: string;
  @IsOptional() @IsString() phone3?: string;
  @IsOptional() @IsNumber() guestsCount?: number | null;
  @IsOptional() @IsNumber() pairsCount?: number | null;
  @IsOptional() @IsNumber() passportCount?: number | null;
  @IsOptional() @IsNumber() age?: number | null;
  @IsOptional() @IsString() insteadOf?: string;
  @IsOptional() @IsString() guestFullName?: string;
  @IsOptional() @IsString() guestPhone?: string;
  @IsOptional() @IsString() leftStatus?: string | null;
  @IsOptional() @IsString() leftReason?: string | null;
  @IsOptional() @IsString() @MaxLength(150) notes?: string;
  @IsOptional() @IsNumber() presentationNumber?: number | null;
  @IsOptional() @IsString() time?: string;
}

// DTO для обновления записи гостя
export class UpdateGuestRecordDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() couponNumber?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() phone2?: string;
  @IsOptional() @IsString() phone3?: string;
  @IsOptional() @IsNumber() guestsCount?: number | null;
  @IsOptional() @IsNumber() pairsCount?: number | null;
  @IsOptional() @IsNumber() passportCount?: number | null;
  @IsOptional() @IsNumber() age?: number | null;
  @IsOptional() @IsString() insteadOf?: string;
  @IsOptional() @IsString() guestFullName?: string;
  @IsOptional() @IsString() guestPhone?: string;
  @IsOptional() @IsString() leftStatus?: string | null;
  @IsOptional() @IsString() leftReason?: string | null;
  @IsOptional() @IsString() @MaxLength(150) notes?: string;
  @IsOptional() @IsNumber() presentationNumber?: number | null;
  @IsOptional() @IsString() time?: string;
}

@Injectable()
export class GuestListsService {
  constructor(private prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Парсинг CSV
  // ──────────────────────────────────────────────────────────────────────────

  /** Разбиваем строку CSV с учётом значений в кавычках */
  private splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Разбираем буфер CSV в массив строк.
   * Формат: ФИО, № купона, Телефон, Телефон2, Телефон3, Гости, Пары,
   *         Паспорт, Возраст, Вместо, ФИО Гостя, Телефон Гостя,
   *         Ушедшие/Невпущенные, Причина, Заметки, Презентация №, Время, Дата
   *
   * Также поддерживаем старый формат: ФИО, Телефон, Дата, Время
   */
  private parseCsv(buffer: Buffer): CsvRow[] {
    const text = buffer.toString('utf-8')
      .replace(/^\uFEFF/, '')          // убираем BOM
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length === 0) return [];

    // Определяем заголовок: первая строка содержит нецифровые слова
    const firstCell = this.splitCsvLine(lines[0])[0].trim().toLowerCase();
    const hasHeader = isNaN(Number(firstCell)) && !firstCell.match(/^\d{6,}/);
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines
      .map((line) => {
        const c = this.splitCsvLine(line);
        // Определяем формат по числу колонок
        // Новый: 18 колонок — полная структура
        // Старый/короткий: ≤4 колонок — ФИО, Телефон, Дата, Время
        if (c.length >= 17) {
          return {
            fullName: c[0] ?? '',
            couponNumber: c[1] ?? '',
            phone: c[2] ?? '',
            phone2: c[3] ?? '',
            phone3: c[4] ?? '',
            guestsCount: c[5] ?? '',
            pairsCount: c[6] ?? '',
            passportCount: c[7] ?? '',
            age: c[8] ?? '',
            insteadOf: c[9] ?? '',
            guestFullName: c[10] ?? '',
            guestPhone: c[11] ?? '',
            leftStatus: c[12] ?? '',
            leftReason: c[13] ?? '',
            notes: c[14] ?? '',
            presentationNumber: c[15] ?? '',
            time: c[16] ?? '',
            date: c[17] ?? '',
          } as CsvRow;
        }
        // Короткий формат: ФИО, Телефон, Дата, Время
        return {
          fullName: c[0] ?? '',
          couponNumber: '',
          phone: c[1] ?? '',
          phone2: '',
          phone3: '',
          guestsCount: '',
          pairsCount: '',
          passportCount: '',
          age: '',
          insteadOf: '',
          guestFullName: '',
          guestPhone: '',
          leftStatus: '',
          leftReason: '',
          notes: '',
          presentationNumber: '',
          time: c[3] ?? '',
          date: c[2] ?? '',
        } as CsvRow;
      })
      .filter((r) => r.phone.replace(/\D/g, '').length >= 7); // строки без телефона пропускаем
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

  /** Конвертирует строку в Int или null */
  private toIntOrNull(v: string): number | null {
    if (!v || v.trim() === '') return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Импорт CSV
  // ──────────────────────────────────────────────────────────────────────────

  async importGuestList(
    tripId: string,
    selectedDate: string, // "YYYY-MM-DD" — выбранная дата
    fileName: string,
    buffer: Buffer,
    userId: string,
  ) {
    // 1. Получаем презентации выезда НА ВЫБРАННУЮ ДАТУ
    const targetDate = new Date(selectedDate + 'T00:00:00.000Z');
    const presentations = await this.prisma.presentation.findMany({
      where: {
        tripId,
        date: targetDate,
      },
      select: { id: true, date: true, time: true, number: true, venue: true },
    });

    if (presentations.length === 0) {
      throw new BadRequestException(
        `На дату ${selectedDate} нет презентаций в этом выезде`,
      );
    }

    // Строим Map: "HH:MM" → { presentationId, number }
    const timeMap = new Map<string, { presId: string; number: number }>();
    for (const p of presentations) {
      const norm = this.normalizeTime(p.time);
      if (norm) timeMap.set(norm, { presId: p.id, number: p.number });
    }

    // 2. Парсим CSV
    const rows = this.parseCsv(buffer);
    if (rows.length === 0) {
      throw new BadRequestException('Файл пустой или не содержит данных');
    }

    // Лимит 2000 строк (до дедупликации)
    if (rows.length > 2000) {
      throw new BadRequestException(
        `Файл содержит ${rows.length} строк. Лимит: 2000 строк за один импорт`,
      );
    }

    // 3. Дедупликация по телефону внутри файла
    const seenPhones = new Set<string>();
    let duplicatesCount = 0;
    const uniqueRows: CsvRow[] = [];
    for (const row of rows) {
      const phone = row.phone.replace(/\D/g, ''); // нормализуем для сравнения
      if (seenPhones.has(phone)) {
        duplicatesCount++;
      } else {
        seenPhones.add(phone);
        uniqueRows.push(row);
      }
    }

    // 4. Валидация каждой строки
    const validRecords: {
      fullName: string;
      couponNumber: string;
      phone: string;
      phone2: string;
      phone3: string;
      guestsCount: number | null;
      pairsCount: number | null;
      passportCount: number | null;
      age: number | null;
      insteadOf: string;
      guestFullName: string;
      guestPhone: string;
      leftStatus: string;
      leftReason: string;
      notes: string;
      presentationId: string;
      presentationNumber: number;
      time: string;
    }[] = [];
    const failedRows: FailedRow[] = [];

    for (const row of uniqueRows) {
      // Валидируем дату строки
      const normDate = this.normalizeDate(row.date);
      if (!normDate) {
        failedRows.push({ fullName: row.fullName, phone: row.phone, date: row.date, time: row.time, error: 'Неверный формат даты' });
        continue;
      }

      // Дата строки должна совпадать с выбранной датой
      if (normDate !== selectedDate) {
        failedRows.push({ fullName: row.fullName, phone: row.phone, date: row.date, time: row.time, error: `Дата ${row.date} не совпадает с выбранной датой (${selectedDate})` });
        continue;
      }

      // Нормализуем время
      const normTime = this.normalizeTime(row.time);
      if (!normTime) {
        failedRows.push({ fullName: row.fullName, phone: row.phone, date: row.date, time: row.time, error: 'Неверный формат времени (ожидается HH:MM)' });
        continue;
      }

      // Проверяем совпадение времени с презентацией
      const matched = timeMap.get(normTime);
      if (!matched) {
        const validTimes = Array.from(timeMap.keys()).join(', ');
        failedRows.push({ fullName: row.fullName, phone: row.phone, date: row.date, time: row.time, error: `Время ${normTime} не найдено среди презентаций на эту дату (доступны: ${validTimes})` });
        continue;
      }

      validRecords.push({
        fullName: row.fullName || '',
        couponNumber: row.couponNumber || '',
        phone: row.phone,
        phone2: row.phone2 || '',
        phone3: row.phone3 || '',
        guestsCount: this.toIntOrNull(row.guestsCount),
        pairsCount: this.toIntOrNull(row.pairsCount),
        passportCount: this.toIntOrNull(row.passportCount),
        age: this.toIntOrNull(row.age),
        insteadOf: row.insteadOf || '',
        guestFullName: row.guestFullName || '',
        guestPhone: row.guestPhone || '',
        leftStatus: row.leftStatus || '',
        leftReason: row.leftReason || '',
        notes: (row.notes || '').substring(0, 150),
        presentationId: matched.presId,
        presentationNumber: matched.number,
        time: normTime,
      });
    }

    // 5. Создаём GuestList + GuestRecord в транзакции
    const guestList = await this.prisma.$transaction(async (tx) => {
      const gl = await tx.guestList.create({
        data: {
          tripId,
          date: selectedDate,
          fileName,
          totalCount: uniqueRows.length,
          importedCount: validRecords.length,
          failedCount: failedRows.length,
          duplicatesCount,
          createdById: userId,
          guests: { create: validRecords },
        },
      });

      // Лог
      await tx.guestImportLog.create({
        data: {
          tripId,
          guestListId: gl.id,
          action: 'IMPORT',
          fileName,
          totalCount: uniqueRows.length,
          importedCount: validRecords.length,
          failedCount: failedRows.length,
          duplicatesCount,
          createdById: userId,
        },
      });

      return gl;
    });

    // 6. Генерируем CSV с ошибками (если есть)
    let errorCsv: string | null = null;
    if (failedRows.length > 0) {
      const header = 'ФИО,Номер,Дата,Время,Причина ошибки';
      const dataLines = failedRows.map(
        (r) => `"${r.fullName}","${r.phone}","${r.date}","${r.time}","${r.error}"`,
      );
      errorCsv = [header, ...dataLines].join('\n');
    }

    return {
      guestList,
      importedCount: validRecords.length,
      failedCount: failedRows.length,
      duplicatesCount,
      totalCount: uniqueRows.length,
      rawTotal: rows.length,
      errorCsv,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Глобальный список всех guest-lists (для отдельной страницы)
  // ──────────────────────────────────────────────────────────────────────────

  async getAllGuestLists() {
    const lists = await this.prisma.guestList.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        trip: { select: { id: true, name: true } },
        _count: { select: { guests: true } },
      },
    });

    // Для каждого списка подтягиваем презентации на его дату
    const tripIds = [...new Set(lists.map((gl) => gl.tripId))];
    const allPresentations = await this.prisma.presentation.findMany({
      where: { tripId: { in: tripIds } },
      select: {
        id: true, name: true, date: true, time: true, number: true, tripId: true,
        venue: { select: { city: true, address: true, venueName: true } },
      },
    });

    return lists.map((gl) => {
      const datePresentations = allPresentations.filter(
        (p) => p.tripId === gl.tripId && p.date.toISOString().split('T')[0] === gl.date,
      );
      return { ...gl, datePresentations };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Список гостей выезда
  // ──────────────────────────────────────────────────────────────────────────

  async getGuestLists(tripId: string) {
    const lists = await this.prisma.guestList.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { guests: true } },
      },
    });

    // Для каждого списка получаем презентации на его дату
    const tripPresentations = await this.prisma.presentation.findMany({
      where: { tripId },
      select: {
        id: true, name: true, date: true, time: true, number: true, status: true,
        venue: { select: { city: true, address: true, venueName: true } },
      },
    });

    return lists.map((gl) => {
      const datePresentations = tripPresentations.filter(
        (p) => p.date.toISOString().split('T')[0] === gl.date,
      );
      return { ...gl, datePresentations };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Детали списка
  // ──────────────────────────────────────────────────────────────────────────

  async getGuestListById(id: string) {
    const gl = await this.prisma.guestList.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        guests: {
          include: {
            presentation: {
              select: {
                id: true, name: true, date: true, time: true, number: true,
                venue: { select: { city: true, address: true, venueName: true } },
              },
            },
          },
          orderBy: [{ presentationNumber: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!gl) throw new NotFoundException('Список гостей не найден');

    // Презентации на дату этого списка
    const datePresentations = await this.prisma.presentation.findMany({
      where: { tripId: gl.tripId, date: new Date(gl.date + 'T00:00:00.000Z') },
      select: {
        id: true, name: true, time: true, number: true,
        venue: { select: { city: true, address: true, venueName: true } },
      },
      orderBy: { number: 'asc' },
    });

    return { ...gl, datePresentations };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Обновление записи гостя
  // ──────────────────────────────────────────────────────────────────────────

  async updateGuestRecord(
    guestListId: string,
    recordId: string,
    dto: UpdateGuestRecordDto,
  ) {
    const record = await this.prisma.guestRecord.findFirst({
      where: { id: recordId, guestListId },
    });
    if (!record) throw new NotFoundException('Запись не найдена');

    // Проверка уникальности купона (не считая текущую запись)
    if (dto.couponNumber && dto.couponNumber !== record.couponNumber) {
      const existing = await this.prisma.guestRecord.findFirst({
        where: { guestListId, couponNumber: dto.couponNumber, id: { not: recordId } },
      });
      if (existing) throw new BadRequestException('errors.couponDuplicate');
    }

    const updateData: any = { ...dto };

    // Если изменился номер презентации — обновляем время и presentationId
    if (
      dto.presentationNumber !== undefined &&
      dto.presentationNumber !== null &&
      dto.presentationNumber !== record.presentationNumber
    ) {
      const gl = await this.prisma.guestList.findUnique({ where: { id: guestListId } });
      const pres = await this.prisma.presentation.findFirst({
        where: {
          tripId: gl!.tripId,
          date: new Date(gl!.date + 'T00:00:00.000Z'),
          number: dto.presentationNumber,
        },
      });
      if (pres) {
        updateData.presentationId = pres.id;
        // Время берём из новой презентации, если явно не передано
        if (!dto.time) {
          updateData.time = pres.time;
        }
      }
    }

    return this.prisma.guestRecord.update({
      where: { id: recordId },
      data: updateData,
      include: {
        presentation: { select: { id: true, name: true, time: true, number: true } },
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Ручное создание записи гостя
  // ──────────────────────────────────────────────────────────────────────────

  // Проверяем, есть ли вручную заполненные данные (запрет удаления)
  private hasFilledData(record: any): boolean {
    return !!(
      record.leftStatus ||
      record.leftReason ||
      record.passportCount !== null ||
      record.insteadOf ||
      record.guestFullName ||
      record.guestPhone ||
      record.notes ||
      record.phone2 ||
      record.phone3
    );
  }

  async createGuestRecord(guestListId: string, dto: CreateGuestRecordDto) {
    const gl = await this.prisma.guestList.findUnique({ where: { id: guestListId } });
    if (!gl) throw new NotFoundException('Список гостей не найден');

    // Проверка уникальности купона внутри списка
    if (dto.couponNumber) {
      const existing = await this.prisma.guestRecord.findFirst({
        where: { guestListId, couponNumber: dto.couponNumber },
      });
      if (existing) throw new BadRequestException('errors.couponDuplicate');
    }

    // Проверка дубля по телефону внутри списка
    if (dto.phone) {
      const existing = await this.prisma.guestRecord.findFirst({
        where: { guestListId, phone: dto.phone },
      });
      if (existing) throw new BadRequestException('errors.phoneDuplicate');
    }

    // Определяем presentationId по номеру презентации (если передан)
    let presentationId: string | null = null;
    let resolvedTime = dto.time || null;
    if (dto.presentationNumber) {
      const pres = await this.prisma.presentation.findFirst({
        where: {
          tripId: gl.tripId,
          date: new Date(gl.date + 'T00:00:00.000Z'),
          number: dto.presentationNumber,
        },
      });
      if (pres) {
        presentationId = pres.id;
        if (!resolvedTime) resolvedTime = pres.time;
      }
    }

    // Если presentationId не определён — берём первую презентацию на дату
    if (!presentationId) {
      const firstPres = await this.prisma.presentation.findFirst({
        where: {
          tripId: gl.tripId,
          date: new Date(gl.date + 'T00:00:00.000Z'),
        },
        orderBy: { number: 'asc' },
      });
      if (!firstPres) {
        throw new BadRequestException('На дату этого списка нет презентаций');
      }
      presentationId = firstPres.id;
    }

    const record = await this.prisma.guestRecord.create({
      data: {
        guestListId,
        presentationId,
        fullName: dto.fullName || null,
        couponNumber: dto.couponNumber || null,
        phone: dto.phone || '',
        phone2: dto.phone2 || null,
        phone3: dto.phone3 || null,
        guestsCount: dto.guestsCount ?? null,
        pairsCount: dto.pairsCount ?? null,
        passportCount: dto.passportCount ?? null,
        age: dto.age ?? null,
        insteadOf: dto.insteadOf || null,
        guestFullName: dto.guestFullName || null,
        guestPhone: dto.guestPhone || null,
        leftStatus: dto.leftStatus || null,
        leftReason: dto.leftReason || null,
        notes: dto.notes ? dto.notes.substring(0, 150) : null,
        presentationNumber: dto.presentationNumber ?? null,
        time: resolvedTime,
      },
      include: {
        presentation: { select: { id: true, name: true, time: true, number: true } },
      },
    });

    // Увеличиваем счётчик активных записей в списке
    await this.prisma.guestList.update({
      where: { id: guestListId },
      data: { importedCount: { increment: 1 } },
    });

    return record;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Удаление одной записи
  // ──────────────────────────────────────────────────────────────────────────

  async deleteGuestRecord(guestListId: string, recordId: string) {
    const record = await this.prisma.guestRecord.findFirst({
      where: { id: recordId, guestListId },
    });
    if (!record) throw new NotFoundException('Запись не найдена');

    // Запрет удаления если вручную внесены данные
    if (this.hasFilledData(record)) {
      throw new BadRequestException('errors.recordHasData');
    }

    await this.prisma.guestRecord.delete({ where: { id: recordId } });
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

    const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const phones = text
      .split('\n')
      .map((l) => l.split(',')[0].trim().replace(/^"|"$/g, '').replace(/\D/g, ''))
      .filter((p) => p.length >= 7);

    if (phones.length === 0) {
      throw new BadRequestException('Файл не содержит номеров');
    }

    const deleted = await this.prisma.guestRecord.deleteMany({
      where: { guestListId, phone: { in: phones } },
    });

    if (deleted.count > 0) {
      await this.prisma.guestList.update({
        where: { id: guestListId },
        data: { importedCount: { decrement: deleted.count } },
      });
    }

    await this.prisma.guestImportLog.create({
      data: {
        tripId: gl.tripId,
        guestListId,
        action: 'DELETE_BY_FILE',
        fileName,
        totalCount: phones.length,
        importedCount: deleted.count,
        failedCount: phones.length - deleted.count,
        duplicatesCount: 0,
        createdById: userId,
      },
    });

    return { deletedCount: deleted.count, totalInFile: phones.length };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // История импортов
  // ──────────────────────────────────────────────────────────────────────────

  async getImportLogs(tripId: string) {
    return this.prisma.guestImportLog.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        guestList: { select: { id: true, fileName: true, date: true } },
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Уникальные даты выезда (для дропдауна при импорте)
  // ──────────────────────────────────────────────────────────────────────────

  async getUniqueDates(tripId: string) {
    const presentations = await this.prisma.presentation.findMany({
      where: { tripId },
      select: {
        date: true,
        time: true,
        number: true,
        name: true,
        venue: { select: { city: true, address: true, venueName: true } },
      },
      orderBy: { date: 'asc' },
    });

    // Группируем по дате
    const map = new Map<string, {
      date: string;
      presentations: { time: string; number: number; name: string; venue: any }[];
    }>();

    for (const p of presentations) {
      const key = p.date.toISOString().split('T')[0];
      if (!map.has(key)) {
        map.set(key, { date: key, presentations: [] });
      }
      map.get(key)!.presentations.push({
        time: p.time,
        number: p.number,
        name: p.name,
        venue: p.venue,
      });
    }

    return Array.from(map.values());
  }
}

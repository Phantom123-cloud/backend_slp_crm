import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GuestListsService } from './guest-lists.service';
import { PrismaService } from '../prisma/prisma.service';

// ────────────────────────────────────────────────────────────────────────────
// Фабрики тестовых данных
// ────────────────────────────────────────────────────────────────────────────

const TRIP_ID = 'trip-1';
const USER_ID = 'user-1';
const PRES_ID_1 = 'pres-1';
const PRES_ID_2 = 'pres-2';
const GL_ID = 'gl-1';
const RECORD_ID = 'rec-1';

/** Презентация с датой 2026-03-08, время 10:00 */
const mockPresentation1 = {
  id: PRES_ID_1,
  date: new Date('2026-03-08T00:00:00.000Z'),
  time: '10:00',
};

/** Презентация с датой 2026-03-08, время 14:30 */
const mockPresentation2 = {
  id: PRES_ID_2,
  date: new Date('2026-03-08T00:00:00.000Z'),
  time: '14:30',
};

/** Создаёт Buffer из CSV строки */
const csv = (content: string): Buffer => Buffer.from(content, 'utf-8');

/** Минимальный мок GuestList */
const mockGuestList = {
  id: GL_ID,
  tripId: TRIP_ID,
  fileName: 'test.csv',
  totalCount: 2,
  importedCount: 2,
  failedCount: 0,
  createdById: USER_ID,
  presentation: null,
  guests: [],
};

// ────────────────────────────────────────────────────────────────────────────
// Мок PrismaService
// ────────────────────────────────────────────────────────────────────────────

const makePrismaMock = (overrides: Record<string, any> = {}) => ({
  presentation: {
    findMany: jest.fn().mockResolvedValue([mockPresentation1, mockPresentation2]),
    ...overrides.presentation,
  },
  guestList: {
    create: jest.fn().mockResolvedValue(mockGuestList),
    findMany: jest.fn().mockResolvedValue([mockGuestList]),
    findUnique: jest.fn().mockResolvedValue(mockGuestList),
    update: jest.fn().mockResolvedValue(mockGuestList),
    ...overrides.guestList,
  },
  guestRecord: {
    findFirst: jest.fn().mockResolvedValue({ id: RECORD_ID, guestListId: GL_ID }),
    delete: jest.fn().mockResolvedValue({ id: RECORD_ID }),
    deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    ...overrides.guestRecord,
  },
  guestImportLog: {
    create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    findMany: jest.fn().mockResolvedValue([]),
    ...overrides.guestImportLog,
  },
  $transaction: jest.fn().mockImplementation((cb: any) =>
    cb({
      guestList: { create: jest.fn().mockResolvedValue(mockGuestList) },
      guestImportLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    }),
  ),
  ...overrides,
});

// ────────────────────────────────────────────────────────────────────────────
// Хелпер для создания сервиса с заданным моком Prisma
// ────────────────────────────────────────────────────────────────────────────

async function buildService(prismaMock?: Record<string, any>) {
  const mock = makePrismaMock(prismaMock);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      GuestListsService,
      { provide: PrismaService, useValue: mock },
    ],
  }).compile();
  return {
    service: module.get<GuestListsService>(GuestListsService),
    prisma: mock,
  };
}

// ============================================================================
// ТЕСТЫ
// ============================================================================

describe('GuestListsService', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // importGuestList — валидация входных данных
  // ──────────────────────────────────────────────────────────────────────────

  describe('importGuestList()', () => {

    it('бросает BadRequestException когда у выезда нет презентаций', async () => {
      const { service } = await buildService({
        presentation: { findMany: jest.fn().mockResolvedValue([]) },
      });
      await expect(
        service.importGuestList(TRIP_ID, undefined, 'test.csv', csv('Иван,998901234567,08.03.2026,10:00'), USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('бросает BadRequestException для пустого файла', async () => {
      const { service } = await buildService();
      await expect(
        service.importGuestList(TRIP_ID, undefined, 'test.csv', csv(''), USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('бросает BadRequestException для файла только с пустыми строками', async () => {
      const { service } = await buildService();
      await expect(
        service.importGuestList(TRIP_ID, undefined, 'test.csv', csv('\n\n\n'), USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    // ── Успешный импорт ──────────────────────────────────────────────────────

    it('успешно импортирует строки с форматом DD.MM.YYYY', async () => {
      const { service, prisma } = await buildService();
      // Заголовок обязателен: первая строка с текстом в col0 воспринимается как заголовок
      const result = await service.importGuestList(
        TRIP_ID,
        undefined,
        'test.csv',
        csv('ФИО,Телефон,Дата,Время\nИван Иванов,998901234567,08.03.2026,10:00'),
        USER_ID,
      );
      expect(result.importedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.errorCsv).toBeNull();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('успешно импортирует строки с форматом YYYY-MM-DD', async () => {
      const { service } = await buildService();
      // Пустое ФИО → col0 пустой → не воспринимается как заголовок
      const result = await service.importGuestList(
        TRIP_ID,
        undefined,
        'test.csv',
        csv(',998901234567,2026-03-08,10:00'),
        USER_ID,
      );
      expect(result.importedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('пропускает файл с заголовком и корректно импортирует данные', async () => {
      const { service } = await buildService();
      const content = 'ФИО,Номер,Дата,Время\nИван Иванов,998901234567,08.03.2026,10:00';
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.totalCount).toBe(1);
      expect(result.importedCount).toBe(1);
    });

    it('корректно обрабатывает CRLF line endings', async () => {
      const { service } = await buildService();
      // Заголовок + 2 строки данных с CRLF
      const content = 'ФИО,Тел,Дата,Время\r\nИван,998901234567,08.03.2026,10:00\r\nПётр,998902345678,08.03.2026,14:30';
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.totalCount).toBe(2);
      expect(result.importedCount).toBe(2);
    });

    it('обрабатывает значения в кавычках', async () => {
      const { service } = await buildService();
      // Заголовок тоже в кавычках
      const content = '"ФИО","Тел","Дата","Время"\n"Иван Иванов","998901234567","08.03.2026","10:00"';
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.importedCount).toBe(1);
    });

    // ── Частичный импорт / ошибки ────────────────────────────────────────────

    it('отклоняет строки с неверным форматом даты', async () => {
      const { service } = await buildService();
      // Пустое ФИО — col0 пустой, строка не считается заголовком
      const content = ',998901234567,08/03/2026,10:00'; // слэши вместо точек
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.importedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errorCsv).toContain('Неверный формат даты');
    });

    it('отклоняет строки с неверным форматом времени', async () => {
      const { service } = await buildService();
      const content = ',998901234567,08.03.2026,ten_oclock'; // пустое ФИО
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.importedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errorCsv).toContain('Неверный формат времени');
    });

    it('отклоняет строки с датой+временем не совпадающими ни с одной презентацией', async () => {
      const { service } = await buildService();
      const content = ',998901234567,15.03.2026,09:00'; // пустое ФИО, такой презентации нет
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.importedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errorCsv).toContain('не найдена в выезде');
    });

    it('смешанный файл: часть импортируется, часть отклоняется', async () => {
      const { service } = await buildService();
      const content = [
        'ФИО,Тел,Дата,Время',                        // заголовок
        'Иван,998901234567,08.03.2026,10:00',         // ✓ PRES_ID_1
        'Пётр,998902345678,08.03.2026,14:30',         // ✓ PRES_ID_2
        'Кирилл,998903456789,99.99.9999,10:00',       // ✗ нет совпадения
        'Алиса,998904567890,15.03.2026,10:00',        // ✗ нет такой презентации
      ].join('\n');
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.totalCount).toBe(4);
      expect(result.importedCount).toBe(2);
      expect(result.failedCount).toBe(2);
      expect(result.errorCsv).not.toBeNull();
    });

    it('errorCsv содержит заголовок и строки с причинами', async () => {
      const { service } = await buildService();
      // Пустое ФИО чтобы строка не считалась заголовком
      const content = ',998901234567,неверная-дата,10:00';
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.errorCsv).toContain('ФИО,Номер,Дата,Время,Причина ошибки');
      expect(result.errorCsv).toContain('998901234567');
    });

    it('errorCsv равен null когда все строки успешны', async () => {
      const { service } = await buildService();
      // Пустое ФИО чтобы строка не считалась заголовком
      const content = ',998901234567,08.03.2026,10:00';
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.errorCsv).toBeNull();
    });

    it('пропускает строки без номера телефона', async () => {
      const { service } = await buildService();
      const content = [
        ',, ,',           // пустая строка (без телефона)
        'Иван,998901234567,08.03.2026,10:00',
      ].join('\n');
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.totalCount).toBe(1); // пустая строка не считается
    });

    it('ФИО может отсутствовать — строка всё равно импортируется', async () => {
      const { service } = await buildService();
      // ФИО пустое, только номер+дата+время
      const content = ',998901234567,08.03.2026,10:00';
      const result = await service.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.importedCount).toBe(1);
    });

    it('время 9:00 нормализуется в 09:00', async () => {
      // Презентация с временем 09:00 — проверяем что нормализация "9:00" → "09:00" работает
      const { service: svc } = await buildService({
        presentation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'pres-morning', date: new Date('2026-03-08T00:00:00.000Z'), time: '09:00' },
          ]),
        },
      });
      // Пустое ФИО: строка не будет считаться заголовком
      const content = ',998901234567,08.03.2026,9:00'; // без ведущего нуля
      const result = await svc.importGuestList(
        TRIP_ID, undefined, 'test.csv', csv(content), USER_ID,
      );
      expect(result.importedCount).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getGuestListById
  // ──────────────────────────────────────────────────────────────────────────

  describe('getGuestListById()', () => {

    it('возвращает список по ID', async () => {
      const { service } = await buildService();
      const result = await service.getGuestListById(GL_ID);
      expect(result).toMatchObject({ id: GL_ID });
    });

    it('бросает NotFoundException если список не найден', async () => {
      const { service } = await buildService({
        guestList: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      await expect(service.getGuestListById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getGuestLists
  // ──────────────────────────────────────────────────────────────────────────

  describe('getGuestLists()', () => {

    it('возвращает все списки выезда', async () => {
      const { service } = await buildService();
      const result = await service.getGuestLists(TRIP_ID);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('возвращает пустой массив если списков нет', async () => {
      const { service } = await buildService({
        guestList: { findMany: jest.fn().mockResolvedValue([]) },
      });
      const result = await service.getGuestLists(TRIP_ID);
      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // deleteGuestRecord
  // ──────────────────────────────────────────────────────────────────────────

  describe('deleteGuestRecord()', () => {

    it('успешно удаляет запись и уменьшает счётчик', async () => {
      const { service, prisma } = await buildService();
      const result = await service.deleteGuestRecord(GL_ID, RECORD_ID);
      expect(result).toEqual({ success: true });
      expect(prisma.guestRecord.delete).toHaveBeenCalledWith({ where: { id: RECORD_ID } });
      expect(prisma.guestList.update).toHaveBeenCalledWith({
        where: { id: GL_ID },
        data: { importedCount: { decrement: 1 } },
      });
    });

    it('бросает NotFoundException если запись не принадлежит этому списку', async () => {
      const { service } = await buildService({
        guestRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.deleteGuestRecord(GL_ID, 'wrong-record-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // deleteByFile
  // ──────────────────────────────────────────────────────────────────────────

  describe('deleteByFile()', () => {

    it('бросает NotFoundException если список не найден', async () => {
      const { service } = await buildService({
        guestList: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.deleteByFile(GL_ID, 'phones.txt', csv('998901234567'), USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('бросает BadRequestException для пустого файла', async () => {
      const { service } = await buildService();
      await expect(
        service.deleteByFile(GL_ID, 'phones.txt', csv(''), USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('удаляет гостей по номерам из файла', async () => {
      const { service, prisma } = await buildService();
      const result = await service.deleteByFile(
        GL_ID,
        'phones.txt',
        csv('998901234567\n998902345678'),
        USER_ID,
      );
      expect(result.totalInFile).toBe(2);
      expect(result.deletedCount).toBe(2); // prisma mock возвращает count:2
      expect(prisma.guestRecord.deleteMany).toHaveBeenCalledWith({
        where: { guestListId: GL_ID, phone: { in: ['998901234567', '998902345678'] } },
      });
    });

    it('корректно считает не найденные номера', async () => {
      const { service } = await buildService({
        guestRecord: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      });
      const result = await service.deleteByFile(
        GL_ID,
        'phones.txt',
        csv('998901234567\n998902345678\n998903456789'), // 3 номера
        USER_ID,
      );
      expect(result.totalInFile).toBe(3);
      expect(result.deletedCount).toBe(1);
    });

    it('создаёт лог с action DELETE_BY_FILE', async () => {
      const { service, prisma } = await buildService();
      await service.deleteByFile(GL_ID, 'phones.txt', csv('998901234567'), USER_ID);
      expect(prisma.guestImportLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'DELETE_BY_FILE' }) }),
      );
    });

    it('обновляет счётчик importedCount после удаления', async () => {
      const { service, prisma } = await buildService({
        guestRecord: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      });
      await service.deleteByFile(GL_ID, 'phones.txt', csv('111\n222\n333'), USER_ID);
      expect(prisma.guestList.update).toHaveBeenCalledWith({
        where: { id: GL_ID },
        data: { importedCount: { decrement: 3 } },
      });
    });

    it('не обновляет счётчик если ни один номер не найден', async () => {
      const { service, prisma } = await buildService({
        guestRecord: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      });
      await service.deleteByFile(GL_ID, 'phones.txt', csv('000000000'), USER_ID);
      expect(prisma.guestList.update).not.toHaveBeenCalled();
    });

    it('парсит номера из CSV файла (первая колонка)', async () => {
      const { service, prisma } = await buildService();
      // Файл в CSV формате с несколькими колонками
      const content = '998901234567,Иванов,Иван\n998902345678,Петров,Пётр';
      await service.deleteByFile(GL_ID, 'phones.csv', csv(content), USER_ID);
      expect(prisma.guestRecord.deleteMany).toHaveBeenCalledWith({
        where: { guestListId: GL_ID, phone: { in: ['998901234567', '998902345678'] } },
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getImportLogs
  // ──────────────────────────────────────────────────────────────────────────

  describe('getImportLogs()', () => {

    it('возвращает историю операций выезда', async () => {
      const mockLogs = [
        { id: 'log-1', action: 'IMPORT', fileName: 'test.csv', tripId: TRIP_ID, totalCount: 10, importedCount: 8, failedCount: 2 },
        { id: 'log-2', action: 'DELETE_BY_FILE', fileName: 'del.txt', tripId: TRIP_ID, totalCount: 3, importedCount: 3, failedCount: 0 },
      ];
      const { service } = await buildService({
        guestImportLog: { findMany: jest.fn().mockResolvedValue(mockLogs) },
      });
      const result = await service.getImportLogs(TRIP_ID);
      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('IMPORT');
      expect(result[1].action).toBe('DELETE_BY_FILE');
    });

    it('возвращает пустой массив если истории нет', async () => {
      const { service } = await buildService({
        guestImportLog: { findMany: jest.fn().mockResolvedValue([]) },
      });
      const result = await service.getImportLogs(TRIP_ID);
      expect(result).toEqual([]);
    });
  });
});

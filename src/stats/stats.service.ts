import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ---- Типы для внутренних вычислений ----

interface GuestStats {
  invited: number;
  arrived: number;
  arrivedPairs: number;
  leftGuests: number;
  leftPairs: number;
  notLetGuests: number;
  notLetPairs: number;
  inHallGuests: number;
  inHallPairs: number;
}

interface SummaryStats {
  successApproach: number | null;
  totalApproach: number | null;
  refusalCount: number | null;
  refusalValue: number | null;
  rewriteCount: number | null;
  rewriteValue: number | null;
}

interface TurnoverStats {
  turnoverBefore: number;
  turnoverAfter: number;
}

// ---- Вспомогательные функции ----

/** Пустая статистика гостей (все нули) */
function emptyGuestStats(): GuestStats {
  return {
    invited: 0,
    arrived: 0,
    arrivedPairs: 0,
    leftGuests: 0,
    leftPairs: 0,
    notLetGuests: 0,
    notLetPairs: 0,
    inHallGuests: 0,
    inHallPairs: 0,
  };
}

/** Пустая сводная статистика (все null) */
function emptySummary(): SummaryStats {
  return {
    successApproach: null,
    totalApproach: null,
    refusalCount: null,
    refusalValue: null,
    rewriteCount: null,
    rewriteValue: null,
  };
}

/** Сложение двух числовых полей: null+null=null, null+num=num, num+num=sum */
function nullAdd(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Суммирует статистику гостей из массива GuestRecord */
function computeGuestStats(records: any[]): GuestStats {
  // Обработанные записи — те, у которых указано guestsCount
  const processed = records.filter((r) => r.guestsCount !== null && r.guestsCount !== undefined);

  // Вычислить количество гостей в массиве записей: длина + сумма guestsCount
  const calcGuests = (recs: any[]) =>
    recs.length + recs.reduce((sum, r) => sum + (r.guestsCount ?? 0), 0);

  // Суммировать пары
  const calcPairs = (recs: any[]) =>
    recs.reduce((sum, r) => sum + (r.pairsCount ?? 0), 0);

  // Разделить по статусу ухода
  const leftRecs = processed.filter((r) => r.leftStatus === 'ушел');
  const notLetRecs = processed.filter((r) => r.leftStatus === 'не пустили');
  const inHallRecs = processed.filter((r) => !r.leftStatus);

  return {
    // Всего приглашённых = длина всего массива записей
    invited: records.length,
    // Пришли = обработанные записи (имеют guestsCount)
    arrived: calcGuests(processed),
    arrivedPairs: calcPairs(processed),
    leftGuests: calcGuests(leftRecs),
    leftPairs: calcPairs(leftRecs),
    notLetGuests: calcGuests(notLetRecs),
    notLetPairs: calcPairs(notLetRecs),
    inHallGuests: calcGuests(inHallRecs),
    inHallPairs: calcPairs(inHallRecs),
  };
}

/** Вычисляет оборот до и после возврата из массива договоров */
function computeTurnover(contracts: any[]): TurnoverStats {
  // Берём только верифицированные договора
  const active = contracts.filter((c) => c.status === 'VERIFIED');
  return {
    turnoverBefore: active.reduce((s, c) => s + Number(c.totalAmount ?? 0), 0),
    turnoverAfter: active.reduce(
      (s, c) => s + Number(c.amountAfterRefund ?? c.totalAmount ?? 0),
      0,
    ),
  };
}

/** Суммирует два объекта TurnoverStats */
function addTurnover(a: TurnoverStats, b: TurnoverStats): TurnoverStats {
  return {
    turnoverBefore: a.turnoverBefore + b.turnoverBefore,
    turnoverAfter: a.turnoverAfter + b.turnoverAfter,
  };
}

/** Суммирует массив PresentationSummary строк в один объект SummaryStats */
function mergeSummaryRows(rows: any[]): SummaryStats {
  return rows.reduce(
    (acc, row) => ({
      successApproach: nullAdd(acc.successApproach, row.successApproach ?? null),
      totalApproach: nullAdd(acc.totalApproach, row.totalApproach ?? null),
      refusalCount: nullAdd(acc.refusalCount, row.refusalCount ?? null),
      refusalValue: nullAdd(acc.refusalValue, row.refusalValue ?? null),
      rewriteCount: nullAdd(acc.rewriteCount, row.rewriteCount ?? null),
      rewriteValue: nullAdd(acc.rewriteValue, row.rewriteValue ?? null),
    }),
    emptySummary(),
  );
}

/** Суммирует два объекта GuestStats поле за полем */
function addGuestStats(a: GuestStats, b: GuestStats): GuestStats {
  return {
    invited: a.invited + b.invited,
    arrived: a.arrived + b.arrived,
    arrivedPairs: a.arrivedPairs + b.arrivedPairs,
    leftGuests: a.leftGuests + b.leftGuests,
    leftPairs: a.leftPairs + b.leftPairs,
    notLetGuests: a.notLetGuests + b.notLetGuests,
    notLetPairs: a.notLetPairs + b.notLetPairs,
    inHallGuests: a.inHallGuests + b.inHallGuests,
    inHallPairs: a.inHallPairs + b.inHallPairs,
  };
}

/** Суммирует два объекта SummaryStats */
function addSummaryStats(a: SummaryStats, b: SummaryStats): SummaryStats {
  return {
    successApproach: nullAdd(a.successApproach, b.successApproach),
    totalApproach: nullAdd(a.totalApproach, b.totalApproach),
    refusalCount: nullAdd(a.refusalCount, b.refusalCount),
    refusalValue: nullAdd(a.refusalValue, b.refusalValue),
    rewriteCount: nullAdd(a.rewriteCount, b.rewriteCount),
    rewriteValue: nullAdd(a.rewriteValue, b.rewriteValue),
  };
}

/** Формирует итоговую строку с вычисленным процентом прихода */
function formatRow(guestStats: GuestStats, summaryStats: SummaryStats, extra: Record<string, any>) {
  const pctArrived =
    guestStats.invited > 0
      ? Math.round((guestStats.arrived / guestStats.invited) * 100)
      : 0;
  return { ...extra, ...guestStats, pctArrived, ...summaryStats };
}

// ---- Вспомогательные функции для форматирования дат ----

/** Форматирует дату как dd.MM.yyyy */
function formatDMY(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/** Форматирует дату как dd.MM */
function formatDM(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

/** Возвращает номер недели ISO (1-53) и год для данной даты */
function getISOWeek(d: Date): { week: number; year: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // ISO 8601: понедельник = первый день недели
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: date.getUTCFullYear() };
}

/** Возвращает дату начала недели (понедельник) и конца недели (воскресенье) */
function getWeekBounds(d: Date): { start: Date; end: Date } {
  const date = new Date(d);
  const day = date.getDay() || 7; // 1=пн, 7=вс
  const start = new Date(date);
  start.setDate(date.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

/** Названия месяцев на русском */
const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Отчёт по договорам ====================

  async getContractStats(fromDate: Date, toDate: Date, filterBy?: string, userId?: string) {
    // Формируем фильтр по сотруднику если задан
    const personFilter: any = {};
    if (filterBy && userId) {
      if (filterBy === 'coordinator') {
        personFilter.presentation = { coordinatorId: userId };
      } else if (filterBy === 'crew') {
        personFilter.presentation = { crew: { some: { userId } } };
      } else if (filterBy === 'employee') {
        // Сотрудник — ищем по координатору ИЛИ ведущему
        personFilter.presentation = {
          OR: [{ coordinatorId: userId }, { crew: { some: { userId } } }],
        };
      }
    }

    // Загружаем все договора за период (по дате договора)
    const contracts = await this.prisma.contract.findMany({
      where: {
        contractDate: { gte: fromDate, lte: toDate },
        ...personFilter,
      },
      include: {
        banks: { include: { bank: true } },
        signedBy: { select: { id: true, firstName: true, lastName: true } },
        presentation: {
          select: {
            coordinatorId: true,
            coordinator: { select: { id: true, firstName: true, lastName: true } },
            crew: {
              select: {
                userId: true,
                role: true,
                user: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });

    const total = contracts.length;
    // Уникальные презентации, по которым есть договора
    const uniquePresentationIds = new Set(contracts.map(c => c.presentationId).filter(Boolean));
    const presentationsCount = uniquePresentationIds.size;
    let turnoverBefore = 0;
    let turnoverAfter = 0;
    let refundsCount = 0;
    let partialRefundsCount = 0;

    // Счётчики по дням для линейного графика
    const byDateMap: Record<string, { date: string; count: number; amount: number; realMoney: number }> = {};

    // Счётчики по источникам
    const bankMap: Record<string, {
      name: string; advance: number; realMoney: number;
      refundAmount: number; partialRefundAmount: number;
      refundRealMoney: number; partialRefundRealMoney: number;
    }> = {};
    let cashTotal = 0, cashRefund = 0, cashPartial = 0;
    let terminalTotal = 0, terminalRefund = 0, terminalPartial = 0;

    // Группировка по менеджерам и типам сделок
    const managerMap: Record<string, { name: string; count: number; turnover: number; realMoney: number }> = {};
    const saleTypeMap: Record<string, { label: string; count: number; turnover: number }> = {};

    // Группировка по координаторам и ведущим (crew)
    type PersonStat = { id: string; name: string; count: number; turnover: number; realMoney: number };
    const coordMap: Record<string, PersonStat> = {};
    const crewMap: Record<string, PersonStat> = {};

    for (const c of contracts) {
      const amount = Number(c.totalAmount ?? 0);
      const afterRefund = c.amountAfterRefund != null ? Number(c.amountAfterRefund) : amount;
      const partialDiff = Math.max(0, amount - afterRefund); // сумма частичного возврата
      turnoverBefore += amount;
      turnoverAfter += afterRefund;

      const isRefund = c.paymentStatus === 'REFUND';
      const isPartial = c.paymentStatus === 'PARTIAL_REFUND';
      if (isRefund) refundsCount++;
      if (isPartial) partialRefundsCount++;

      // Менеджер (подписавший договор)
      const managerId = c.signedById;
      const managerName = c.signedBy
        ? `${c.signedBy.firstName ?? ''} ${c.signedBy.lastName ?? ''}`.trim() || 'Неизвестно'
        : 'Неизвестно';
      if (!managerMap[managerId]) managerMap[managerId] = { name: managerName, count: 0, turnover: 0, realMoney: 0 };
      if (!isRefund) {
        managerMap[managerId].count++;
        managerMap[managerId].turnover += amount;
      }

      // Тип сделки
      const st = c.saleType ?? 'OTHER';
      const stLabel = st === 'RAFFLE' ? 'Розыгрыш' : st === 'HOURLY' ? 'Часовка' : 'Без типа';
      if (!saleTypeMap[st]) saleTypeMap[st] = { label: stLabel, count: 0, turnover: 0 };
      saleTypeMap[st].count++;
      saleTypeMap[st].turnover += amount;

      // По дням
      const dateKey = c.contractDate.toISOString().slice(0, 10);
      if (!byDateMap[dateKey]) byDateMap[dateKey] = { date: dateKey, count: 0, amount: 0, realMoney: 0 };
      byDateMap[dateKey].count++;
      byDateMap[dateKey].amount += amount;

      // Авансы (для REFUND авансы обнулены, берём фактические значения)
      const cash = Number(c.advanceCash ?? 0);
      const terminal = Number(c.advanceTerminal ?? 0);
      cashTotal += cash;
      terminalTotal += terminal;

      // Банковские авансы: для REFUND берём totalAmount минус наличные/терминал как банковскую часть
      const bankAdvTotal = c.banks.reduce((s, b) => s + (b.advance != null ? Number(b.advance) : 0), 0);

      // Пропорциональное распределение возвратов по источникам.
      // Для полного REFUND: авансы обнулены → определяем источник по типу оплаты
      if (isRefund) {
        const pt = c.paymentType;
        if (pt === 'CASH') {
          cashRefund += amount;
        } else if (pt === 'TERMINAL') {
          terminalRefund += amount;
        } else if (pt === 'CREDIT') {
          // Кредит — весь возврат на первый банк
          const firstBank = c.banks[0];
          const bankName = firstBank?.bank?.name ?? 'Банк';
          if (!bankMap[bankName]) bankMap[bankName] = { name: bankName, advance: 0, realMoney: 0, refundAmount: 0, partialRefundAmount: 0, refundRealMoney: 0, partialRefundRealMoney: 0 };
          const refundRate = firstBank?.conditionRate != null ? Number(firstBank.conditionRate) : 0;
          bankMap[bankName].refundAmount += amount;
          // Реальные деньги возврата с учётом комиссии банка
          bankMap[bankName].refundRealMoney += amount * (1 - refundRate / 100);
        } else {
          // MIXED / COMPANY: распределяем по числу источников поровну
          const sources = c.banks.length + (cash > 0 ? 1 : 0) + (terminal > 0 ? 1 : 0) || 1;
          const perSource = amount / sources;
          if (cash > 0) cashRefund += perSource;
          if (terminal > 0) terminalRefund += perSource;
          for (const b of c.banks) {
            const bankName = b.bank?.name ?? 'Банк';
            const mixedRate = b.conditionRate != null ? Number(b.conditionRate) : 0;
            if (!bankMap[bankName]) bankMap[bankName] = { name: bankName, advance: 0, realMoney: 0, refundAmount: 0, partialRefundAmount: 0, refundRealMoney: 0, partialRefundRealMoney: 0 };
            bankMap[bankName].refundAmount += perSource;
            bankMap[bankName].refundRealMoney += perSource * (1 - mixedRate / 100);
          }
        }
      }

      // Для PARTIAL_REFUND — пропорционально текущим авансам
      if (isPartial) {
        const totalAdv = cash + terminal + bankAdvTotal || 1;
        cashPartial += partialDiff * (cash / totalAdv);
        terminalPartial += partialDiff * (terminal / totalAdv);
      }

      // Реальные деньги по банкам
      for (const b of c.banks) {
        if (b.advance == null) continue;
        const adv = Number(b.advance);
        const rate = b.conditionRate != null ? Number(b.conditionRate) : 0;
        const real = adv * (1 - rate / 100);
        const bankName = b.bank?.name ?? 'Банк';
        if (!bankMap[bankName]) bankMap[bankName] = { name: bankName, advance: 0, realMoney: 0, refundAmount: 0, partialRefundAmount: 0, refundRealMoney: 0, partialRefundRealMoney: 0 };
        bankMap[bankName].advance += adv;
        bankMap[bankName].realMoney += real;
        byDateMap[dateKey].realMoney += real;

        if (isPartial) {
          const totalAdv = cash + terminal + bankAdvTotal || 1;
          const bankPartialDiff = partialDiff * (adv / totalAdv);
          bankMap[bankName].partialRefundAmount += bankPartialDiff;
          bankMap[bankName].partialRefundRealMoney += bankPartialDiff * (1 - rate / 100);
        }
      }
      byDateMap[dateKey].realMoney += cash + terminal;

      // Реал. деньги = наличные + терминал + банки (с учётом комиссий)
      if (!isRefund) {
        const bankRealSum = c.banks.reduce((sum, b) => {
          if (b.advance == null) return sum;
          const r = b.conditionRate != null ? Number(b.conditionRate) : 0;
          return sum + Number(b.advance) * (1 - r / 100);
        }, 0);
        const contractRealMoney = cash + terminal + bankRealSum;
        managerMap[managerId].realMoney += contractRealMoney;

        // Координатор презентации
        if (c.presentation?.coordinator) {
          const coord = c.presentation.coordinator;
          const cid = coord.id;
          const cname = `${coord.firstName ?? ''} ${coord.lastName ?? ''}`.trim() || 'Неизвестно';
          if (!coordMap[cid]) coordMap[cid] = { id: cid, name: cname, count: 0, turnover: 0, realMoney: 0 };
          coordMap[cid].count++;
          coordMap[cid].turnover += amount;
          coordMap[cid].realMoney += contractRealMoney;
        }

        // Ведущие (crew) презентации
        for (const cm of c.presentation?.crew ?? []) {
          const uid = cm.userId;
          const uname = `${cm.user.firstName ?? ''} ${cm.user.lastName ?? ''}`.trim() || 'Неизвестно';
          if (!crewMap[uid]) crewMap[uid] = { id: uid, name: uname, count: 0, turnover: 0, realMoney: 0 };
          crewMap[uid].count++;
          crewMap[uid].turnover += amount;
          crewMap[uid].realMoney += contractRealMoney;
        }
      }
    }

    // Итоговый список источников
    const bankStats = [
      ...Object.values(bankMap),
      // Наличные и терминал: нет комиссии, refundRealMoney = refundAmount
      { name: 'Наличные', advance: cashTotal, realMoney: cashTotal, refundAmount: cashRefund, partialRefundAmount: cashPartial, refundRealMoney: cashRefund, partialRefundRealMoney: cashPartial },
      { name: 'Терминал', advance: terminalTotal, realMoney: terminalTotal, refundAmount: terminalRefund, partialRefundAmount: terminalPartial, refundRealMoney: terminalRefund, partialRefundRealMoney: terminalPartial },
    ]
      .filter(b => b.advance > 0 || b.realMoney > 0 || b.refundAmount > 0 || b.partialRefundAmount > 0)
      .map(b => ({
        ...b,
        // advanceBefore = текущий аванс + возвращённые авансы
        advanceBefore: Math.round(b.advance + b.refundAmount + b.partialRefundAmount),
        // realMoneyBefore = текущие реал. деньги + реал. деньги от возвращённых договоров (с учётом комиссии)
        realMoneyBefore: Math.round(b.realMoney + b.refundRealMoney + b.partialRefundRealMoney),
        refundAmount: Math.round(b.refundAmount),
        partialRefundAmount: Math.round(b.partialRefundAmount),
      }));

    const totalRealMoney = bankStats.reduce((s, b) => s + b.realMoney, 0);
    const totalRealMoneyBefore = bankStats.reduce((s, b) => s + b.realMoneyBefore, 0);
    const totalAdvanceBefore = bankStats.reduce((s, b) => s + b.advanceBefore, 0);
    const byDate = Object.values(byDateMap).sort((a, b) => a.date.localeCompare(b.date));

    // Данные для диаграммы возвратов по источникам
    const refundChart = bankStats
      .filter(b => b.refundAmount > 0 || b.partialRefundAmount > 0)
      .map(b => ({
        name: b.name,
        refundAmount: Math.round(b.refundAmount),
        partialRefundAmount: Math.round(b.partialRefundAmount),
      }));

    // Топ менеджеров
    const byManager = Object.values(managerMap)
      .map(m => ({ ...m, turnover: Math.round(m.turnover), realMoney: Math.round(m.realMoney) }))
      .sort((a, b) => b.turnover - a.turnover)
      .slice(0, 10);

    // Разбивка по типам сделок
    const bySaleType = Object.values(saleTypeMap)
      .map(s => ({ ...s, turnover: Math.round(s.turnover) }))
      .sort((a, b) => b.turnover - a.turnover);

    // Координаторы — сортировка по обороту
    const byCoordinator = Object.values(coordMap)
      .map(c => ({ ...c, turnover: Math.round(c.turnover), realMoney: Math.round(c.realMoney) }))
      .sort((a, b) => b.turnover - a.turnover);

    // Ведущие (crew) — сортировка по обороту
    const byHost = Object.values(crewMap)
      .map(c => ({ ...c, turnover: Math.round(c.turnover), realMoney: Math.round(c.realMoney) }))
      .sort((a, b) => b.turnover - a.turnover);

    // Все сотрудники (union координаторов и ведущих, без дублей)
    const allEmployeeMap: Record<string, PersonStat & { roles: string[] }> = {};
    for (const c of byCoordinator) {
      if (!allEmployeeMap[c.id]) allEmployeeMap[c.id] = { ...c, roles: [] };
      if (!allEmployeeMap[c.id].roles.includes('Координатор')) allEmployeeMap[c.id].roles.push('Координатор');
    }
    for (const c of byHost) {
      if (!allEmployeeMap[c.id]) allEmployeeMap[c.id] = { ...c, roles: [] };
      if (!allEmployeeMap[c.id].roles.includes('Ведущий')) allEmployeeMap[c.id].roles.push('Ведущий');
    }
    const byEmployee = Object.values(allEmployeeMap).sort((a, b) => b.turnover - a.turnover);

    return {
      total,
      presentationsCount,
      refundsCount,
      partialRefundsCount,
      turnoverBefore,
      turnoverAfter,
      totalRealMoney,
      totalRealMoneyBefore,
      totalAdvanceBefore,
      avgContract: total > 0 ? Math.round(turnoverBefore / total) : 0,
      avgPerPresentation: presentationsCount > 0 ? Math.round(turnoverBefore / presentationsCount) : 0,
      avgPerPresentationAfter: presentationsCount > 0 ? Math.round(turnoverAfter / presentationsCount) : 0,
      bankStats,
      byDate,
      refundChart,
      byManager,
      bySaleType,
      byCoordinator,
      byHost,
      byEmployee,
    };
  }

  async getPresentationStats(
    fromDate: Date,
    toDate: Date,
    groupBy: string,
    tab: string,
  ) {
    // ---- Шаг 1: Загружаем презентации ----
    let presentations: any[];

    if (groupBy === 'trip') {
      // Для группировки по выезду: находим выезды, пересекающиеся с диапазоном дат
      const trips = await this.prisma.trip.findMany({
        where: {
          startDate: { lte: toDate },
          endDate: { gte: fromDate },
        },
        select: { id: true },
      });
      const tripIds = trips.map((t) => t.id);

      // Берём ВСЕ презентации этих выездов (независимо от даты)
      presentations = await this.prisma.presentation.findMany({
        where: { tripId: { in: tripIds } },
        include: {
          trip: {
            select: { id: true, teamName: true, startDate: true, endDate: true },
          },
          coordinator: {
            select: { id: true, firstName: true, lastName: true },
          },
          crew: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          summaryRows: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          guestRecords: {
            select: { guestsCount: true, pairsCount: true, leftStatus: true },
          },
          contracts: {
            select: { totalAmount: true, amountAfterRefund: true, status: true },
          },
          type: { select: { id: true, name: true } },
          venue: { select: { id: true, venueName: true, address: true, city: true } },
        },
      });
    } else {
      // Для остальных группировок: фильтруем по дате самой презентации
      presentations = await this.prisma.presentation.findMany({
        where: {
          date: { gte: fromDate, lte: toDate },
        },
        include: {
          trip: {
            select: { id: true, teamName: true, startDate: true, endDate: true },
          },
          coordinator: {
            select: { id: true, firstName: true, lastName: true },
          },
          crew: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          summaryRows: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          guestRecords: {
            select: { guestsCount: true, pairsCount: true, leftStatus: true },
          },
          contracts: {
            select: { totalAmount: true, amountAfterRefund: true, status: true },
          },
          type: { select: { id: true, name: true } },
          venue: { select: { id: true, venueName: true, address: true, city: true } },
        },
      });
    }

    // ---- Шаг 2: Маршрутизация по вкладке ----
    switch (tab) {
      case 'leaders':
        return this.buildLeadersTab(presentations);
      case 'coordinators':
        return this.buildCoordinatorsTab(presentations);
      case 'individual':
        return this.buildIndividualTab(presentations);
      default:
        return this.buildDatesTab(presentations, groupBy);
    }
  }

  // ---- Вкладка "По датам" ----
  private buildDatesTab(presentations: any[], groupBy: string) {
    // Сгруппировать по ключу
    const groups = new Map<string, { label: string; pres: any[] }>();

    for (const pres of presentations) {
      const date = new Date(pres.date);
      let key: string;
      let label: string;

      switch (groupBy) {
        case 'day': {
          // Ключ: yyyy-MM-dd, метка: dd.MM.yyyy
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          key = `${y}-${m}-${d}`;
          label = `${d}.${m}.${y}`;
          break;
        }
        case 'week': {
          const { week, year } = getISOWeek(date);
          key = `${year}-W${String(week).padStart(2, '0')}`;
          const { start, end } = getWeekBounds(date);
          label = `Нед. ${week}, ${year} (${formatDM(start)}–${formatDMY(end)})`;
          break;
        }
        case 'year': {
          key = String(date.getFullYear());
          label = key;
          break;
        }
        case 'trip': {
          key = pres.trip.id;
          const startFmt = formatDM(new Date(pres.trip.startDate));
          const endFmt = formatDMY(new Date(pres.trip.endDate));
          label = `${pres.trip.teamName} (${startFmt}–${endFmt})`;
          break;
        }
        case 'presentation': {
          // Каждая презентация — отдельная строка
          key = pres.id;
          label = pres.name;
          break;
        }
        default: {
          // month
          const y = date.getFullYear();
          const mIdx = date.getMonth();
          key = `${y}-${String(mIdx + 1).padStart(2, '0')}`;
          label = `${MONTH_NAMES_RU[mIdx]} ${y}`;
          break;
        }
      }

      if (!groups.has(key)) {
        groups.set(key, { label, pres: [] });
      }
      groups.get(key)!.pres.push(pres);
    }

    // Собираем результирующие строки
    const rows: any[] = [];
    for (const [key, { label, pres }] of groups.entries()) {
      // Суммируем гостевую статистику по всем презентациям группы
      const guestStats = pres.reduce(
        (acc, p) => addGuestStats(acc, computeGuestStats(p.guestRecords)),
        emptyGuestStats(),
      );
      // Суммируем все summaryRows всех презентаций группы
      const allSummaryRows = pres.flatMap((p) => p.summaryRows);
      const summaryStats = mergeSummaryRows(allSummaryRows);
      // Вычисляем оборот по всем договорам группы
      const allContracts = pres.flatMap((p) => p.contracts ?? []);
      const turnover = computeTurnover(allContracts);

      rows.push(
        formatRow(guestStats, summaryStats, {
          key,
          label,
          presentationsCount: pres.length,
          ...turnover,
        }),
      );
    }

    // Добавляем доп. поля для группировки по презентациям
    if (groupBy === 'presentation') {
      for (const row of rows) {
        const p = (groups.get(row.key) as any)?.pres[0];
        if (p) {
          // Дата в формате dd.MM.yyyy
          const d = new Date(p.date);
          row.presDate = formatDMY(d);
          row.presDateSort = d.toISOString().substring(0, 10);
          row.presTime = p.time ?? '—';
          row.presType = p.type?.name ?? '—';
          row.presVenue = p.venue
            ? (p.venue.venueName || p.venue.address || '—')
            : '—';
        }
      }
      // Сортируем по дате и времени
      rows.sort((a, b) => {
        const ka = `${a.presDateSort ?? ''}T${a.presTime ?? '00:00'}`;
        const kb = `${b.presDateSort ?? ''}T${b.presTime ?? '00:00'}`;
        return ka.localeCompare(kb);
      });
    } else {
      // Сортируем по ключу (хронологически)
      rows.sort((a, b) => a.key.localeCompare(b.key));
    }
    return rows;
  }

  // ---- Вкладка "По ведущим" ----
  private buildLeadersTab(presentations: any[]) {
    // Собираем уникальных лидеров
    const leaders = new Map<
      string,
      { user: any; pres: any[] }
    >();

    for (const pres of presentations) {
      for (const crewMember of pres.crew) {
        if (crewMember.role === 'LEADER') {
          const userId = crewMember.user.id;
          if (!leaders.has(userId)) {
            leaders.set(userId, { user: crewMember.user, pres: [] });
          }
          // Добавляем ссылку на презентацию (с контекстом — для этого лидера)
          leaders.get(userId)!.pres.push(pres);
        }
      }
    }

    const rows: any[] = [];
    for (const [userId, { user, pres }] of leaders.entries()) {
      // Гостевая статистика — по всем презентациям где этот юзер в роли LEADER
      const guestStats = pres.reduce(
        (acc, p) => addGuestStats(acc, computeGuestStats(p.guestRecords)),
        emptyGuestStats(),
      );
      // Сводная статистика — только строки summaryRows этого пользователя
      const personalSummaryRows = pres
        .flatMap((p) => p.summaryRows)
        .filter((r) => r.userId === userId);
      const summaryStats = mergeSummaryRows(personalSummaryRows);
      // Оборот по всем договорам презентаций этого ведущего
      const allContracts = pres.flatMap((p) => p.contracts ?? []);
      const turnover = computeTurnover(allContracts);

      rows.push(
        formatRow(guestStats, summaryStats, {
          key: userId,
          label: `${user.firstName} ${user.lastName}`,
          userId,
          presentationsCount: pres.length,
          ...turnover,
        }),
      );
    }

    // Сортируем по имени
    rows.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    return rows;
  }

  // ---- Вкладка "По координаторам" ----
  private buildCoordinatorsTab(presentations: any[]) {
    // Собираем уникальных координаторов
    const coordinators = new Map<
      string,
      { user: any; pres: any[] }
    >();

    for (const pres of presentations) {
      if (!pres.coordinator) continue;
      const userId = pres.coordinator.id;
      if (!coordinators.has(userId)) {
        coordinators.set(userId, { user: pres.coordinator, pres: [] });
      }
      coordinators.get(userId)!.pres.push(pres);
    }

    const rows: any[] = [];
    for (const [userId, { user, pres }] of coordinators.entries()) {
      // Гостевая статистика — по всем презентациям этого координатора
      const guestStats = pres.reduce(
        (acc, p) => addGuestStats(acc, computeGuestStats(p.guestRecords)),
        emptyGuestStats(),
      );
      // Сводная статистика — ВСЕ summaryRows всех презентаций координатора
      const allSummaryRows = pres.flatMap((p) => p.summaryRows);
      const summaryStats = mergeSummaryRows(allSummaryRows);
      // Оборот по всем договорам презентаций этого координатора
      const allContracts = pres.flatMap((p) => p.contracts ?? []);
      const turnover = computeTurnover(allContracts);

      rows.push(
        formatRow(guestStats, summaryStats, {
          key: userId,
          label: `${user.firstName} ${user.lastName}`,
          userId,
          presentationsCount: pres.length,
          ...turnover,
        }),
      );
    }

    rows.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    return rows;
  }

  // ---- Вкладка "Индивидуально" ----
  private buildIndividualTab(presentations: any[]) {
    // Собираем всех уникальных участников состава
    const individuals = new Map<
      string,
      { user: any; role: string; pres: any[] }
    >();

    for (const pres of presentations) {
      for (const crewMember of pres.crew) {
        const userId = crewMember.user.id;
        if (!individuals.has(userId)) {
          individuals.set(userId, {
            user: crewMember.user,
            role: crewMember.role,
            pres: [],
          });
        }
        // Обновляем роль (берём последнюю встречённую)
        individuals.get(userId)!.role = crewMember.role;
        individuals.get(userId)!.pres.push(pres);
      }
    }

    const rows: any[] = [];
    for (const [userId, { user, role, pres }] of individuals.entries()) {
      // Гостевая статистика — по всем презентациям где этот юзер в составе
      const guestStats = pres.reduce(
        (acc, p) => addGuestStats(acc, computeGuestStats(p.guestRecords)),
        emptyGuestStats(),
      );
      // Сводная статистика — только строки summaryRows этого пользователя
      const personalSummaryRows = pres
        .flatMap((p) => p.summaryRows)
        .filter((r) => r.userId === userId);
      const summaryStats = mergeSummaryRows(personalSummaryRows);
      // Оборот по всем договорам презентаций этого участника
      const allContracts = pres.flatMap((p) => p.contracts ?? []);
      const turnover = computeTurnover(allContracts);

      rows.push(
        formatRow(guestStats, summaryStats, {
          key: userId,
          label: `${user.firstName} ${user.lastName}`,
          userId,
          role,
          presentationsCount: pres.length,
          ...turnover,
        }),
      );
    }

    rows.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    return rows;
  }
}

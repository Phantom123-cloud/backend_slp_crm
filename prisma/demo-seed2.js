/**
 * demo-seed2.js — вторая волна тестовых данных (II..PP, март–май 2026)
 * Запуск: node prisma/demo-seed2.js
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// ── Константы ─────────────────────────────────────────────────────────────────
const ADMIN_ID    = 'f9612952-0377-4e98-8670-8ff5986c4241';
const TYPE_POSUDA  = '9f2b2873-d7ae-46a1-b0ee-803ebed3dea5';

const LAST_NAMES  = [
  'Иванов','Петров','Сидоров','Козлов','Новиков','Морозов','Попов','Лебедев',
  'Ковалёв','Соколов','Волков','Зайцев','Павлов','Семёнов','Голубев','Виноградов',
  'Богданов','Воробьёв','Фёдоров','Михайлов','Беляев','Тарасов','Белов','Комаров',
  'Орлов','Киселёв','Макаров','Андреев','Ковалёва','Захарова','Шевченко','Романов',
  'Степанов','Казаков','Кузнецов','Смирнов','Васильев','Мартынов','Гусев','Ефимов',
];
const FIRST_NAMES = [
  'Александр','Михаил','Иван','Дмитрий','Андрей','Алексей','Максим','Евгений',
  'Сергей','Артём','Никита','Владимир','Павел','Роман','Антон','Илья',
  'Наталья','Елена','Светлана','Ольга','Татьяна','Ирина','Мария','Анна',
  'Екатерина','Людмила','Валентина','Галина','Юлия','Диана',
];
const PATRONS = [
  'Александрович','Михайлович','Иванович','Дмитриевич','Андреевич',
  'Алексеевич','Максимович','Евгеньевич','Сергеевич','Артёмович',
  'Владимировна','Петровна','Сергеевна','Андреевна','Михайловна',
];

// ~65% пришёл, ~20% ушел, ~15% не пустили
const LEFT_POOL = [
  null,null,null,null,null,null,null,null,null,
  'ушел','ушел','ушел',
  'не пустили','не пустили',
];
const LEFT_REASONS = ['Пьяные','Агрессивные','Молодые/Старые','Нет времени','Не интересно','Нет места','Посторонние'];

const TIMES = [
  { time: '10:00', number: 1 },
  { time: '14:30', number: 2 },
  { time: '18:30', number: 3 },
];

// ── Утилиты ───────────────────────────────────────────────────────────────────
let phoneCounter = 998905000000;
const nextPhone = () => String(++phoneCounter);
const rnd    = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const fullName = () => `${rnd(LAST_NAMES)} ${rnd(FIRST_NAMES)} ${rnd(PATRONS)}`;

// UTC-safe дата (без сдвига часового пояса)
const d = (year, month, day) =>
  new Date(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T00:00:00.000Z`);

// Следующий день (UTC)
const nextDay = (date) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
};

// ── Описания выездов ──────────────────────────────────────────────────────────
const tripDefs = [
  { teamName: 'II', start: d(2026,3,19), end: d(2026,3,21) },
  { teamName: 'JJ', start: d(2026,3,26), end: d(2026,3,28) },
  { teamName: 'KK', start: d(2026,4,2),  end: d(2026,4,4)  },
  { teamName: 'LL', start: d(2026,4,9),  end: d(2026,4,11) },
  { teamName: 'MM', start: d(2026,4,16), end: d(2026,4,18) },
  { teamName: 'NN', start: d(2026,4,23), end: d(2026,4,25) },
  { teamName: 'OO', start: d(2026,5,7),  end: d(2026,5,9)  },
  { teamName: 'PP', start: d(2026,5,14), end: d(2026,5,16) },
];

// ── Основная функция ──────────────────────────────────────────────────────────
async function main() {
  // Новые места
  const venueGarden = await p.venue.upsert({
    where: { city_address_venueName: { city: 'Ташкент', address: 'ул. Амира Темура, 107', venueName: 'Сад Эдем' } },
    create: { city: 'Ташкент', address: 'ул. Амира Темура, 107', venueName: 'Сад Эдем' },
    update: {},
  });
  const venuePalace = await p.venue.upsert({
    where: { city_address_venueName: { city: 'Бухара', address: 'ул. Мухаммад Икбол, 3', venueName: 'Дворец торжеств' } },
    create: { city: 'Бухара', address: 'ул. Мухаммад Икбол, 3', venueName: 'Дворец торжеств' },
    update: {},
  });
  const typeJewelry = await p.presentationType.upsert({
    where: { name: 'Ювелирные изделия' },
    create: { name: 'Ювелирные изделия' },
    update: {},
  });

  const allVenues = await p.venue.findMany({ select: { id: true } });
  const allTypes  = await p.presentationType.findMany({ select: { id: true } });
  const venueIds  = allVenues.map(v => v.id);
  const typeIds   = allTypes.map(t => t.id);

  for (const def of tripDefs) {
    const sd = def.start;
    const mm = String(sd.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(sd.getUTCDate()).padStart(2, '0');
    const yy = String(sd.getUTCFullYear()).slice(2);
    const tripName = `${def.teamName}${yy}${mm}${dd}`;

    let trip = await p.trip.findFirst({ where: { name: tripName } });
    if (!trip) {
      trip = await p.trip.create({
        data: {
          name: tripName,
          teamName: def.teamName,
          startDate: def.start,
          endDate: def.end,
          status: 'PLANNED',
          createdById: ADMIN_ID,
        },
      });
      console.log(`✓ Trip: ${tripName}`);
    } else {
      console.log(`- Trip exists: ${tripName}`);
    }

    // Добавляем ADMIN как LEADER выезда
    await p.tripCrew.upsert({
      where: { tripId_userId: { tripId: trip.id, userId: ADMIN_ID } },
      create: { tripId: trip.id, userId: ADMIN_ID, role: 'LEADER' },
      update: {},
    });

    // Итерируем по дням
    let cur = new Date(def.start);
    while (cur <= def.end) {
      const dateStr = cur.toISOString().split('T')[0];

      for (const slot of TIMES) {
        const presName = `${def.teamName} ${String(cur.getUTCDate()).padStart(2,'0')}.${String(cur.getUTCMonth()+1).padStart(2,'0')} #${slot.number}`;

        let pres = await p.presentation.findFirst({
          where: { tripId: trip.id, date: cur, time: slot.time },
        });
        if (!pres) {
          pres = await p.presentation.create({
            data: {
              tripId: trip.id,
              name: presName,
              date: cur,
              time: slot.time,
              number: slot.number,
              status: 'PLANNED',
              venueId: rnd(venueIds),
              typeId: rnd(typeIds),
              createdById: ADMIN_ID,
            },
          });
          console.log(`  ✓ Presentation: ${presName}`);
        }

        // Список гостей (один на дату)
        let guestList = await p.guestList.findFirst({
          where: { tripId: trip.id, date: dateStr },
        });
        const totalForDay = rndInt(25, 50);
        if (!guestList) {
          guestList = await p.guestList.create({
            data: {
              tripId: trip.id,
              date: dateStr,
              fileName: `${def.teamName}_${dateStr.replace(/-/g,'')}.csv`,
              totalCount: totalForDay,
              importedCount: totalForDay,
              failedCount: 0,
              duplicatesCount: 0,
              createdById: ADMIN_ID,
            },
          });
          console.log(`    ✓ GuestList: ${dateStr} (${totalForDay} чел.)`);
        }

        // Записи гостей для этой презентации
        const existingCount = await p.guestRecord.count({
          where: { guestListId: guestList.id, presentationId: pres.id },
        });
        if (existingCount === 0) {
          const perSlot = Math.floor(totalForDay / TIMES.length);
          const records = [];
          for (let i = 0; i < perSlot; i++) {
            const leftStatus = rnd(LEFT_POOL);
            const pairs = rndInt(0, 3);
            records.push({
              guestListId: guestList.id,
              presentationId: pres.id,
              fullName: fullName(),
              phone: nextPhone(),
              pairsCount: pairs,
              guestsCount: pairs,
              age: rndInt(25, 70),
              couponNumber: `${rndInt(1,4)}${rnd(['в','т','з','к'])}`,
              presentationNumber: slot.number,
              time: slot.time,
              leftStatus,
              leftReason: leftStatus ? rnd(LEFT_REASONS) : null,
            });
          }
          await p.guestRecord.createMany({ data: records });
          console.log(`      ✓ GuestRecords: ${records.length} для ${presName}`);
        }
      }

      cur = nextDay(cur);
    }
  }

  console.log('\n✅ Demo seed 2 завершён!');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());

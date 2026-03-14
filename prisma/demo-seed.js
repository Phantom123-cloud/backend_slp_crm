/**
 * demo-seed.js — первая волна тестовых данных (AA..HH, январь–март 2026)
 * Запуск: node prisma/demo-seed.js
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// ── Константы ─────────────────────────────────────────────────────────────────
const ADMIN_ID   = 'f9612952-0377-4e98-8670-8ff5986c4241';
const VENUE_ORCHID = '7ea56543-e093-47f8-a2df-a9dc99c539e5'; // Ташкент / Орхидея
const TYPE_POSUDA  = '9f2b2873-d7ae-46a1-b0ee-803ebed3dea5'; // Посуда

const LAST_NAMES  = ['Иванов','Петров','Сидоров','Козлов','Новиков','Морозов','Попов','Лебедев','Ковалёв','Соколов','Волков','Зайцев','Павлов','Семёнов','Голубев','Виноградов','Богданов','Воробьёв','Фёдоров','Михайлов','Беляев','Тарасов','Белов','Комаров','Орлов','Киселёв','Макаров','Андреев','Ковалёва','Захарова'];
const FIRST_NAMES = ['Александр','Михаил','Иван','Дмитрий','Андрей','Алексей','Максим','Евгений','Сергей','Артём','Никита','Владимир','Павел','Роман','Антон','Илья','Константин','Денис','Виталий','Олег','Наталья','Елена','Светлана','Ольга','Татьяна','Ирина','Мария','Анна','Екатерина','Людмила'];
const PATRONS    = ['Александрович','Михайлович','Иванович','Дмитриевич','Андреевич','Алексеевич','Максимович','Евгеньевич','Сергеевич','Артёмович'];

// ~65% пришёл, ~20% ушел, ~15% не пустили
const LEFT_POOL = [null,null,null,null,null,null,null,null,null,'ушел','ушел','ушел','не пустили','не пустили'];
const LEFT_REASONS = ['Пьяные','Агрессивные','Молодые/Старые','Нет времени','Не интересно','Нет места'];

const TIMES = [
  { time: '10:00', number: 1 },
  { time: '14:30', number: 2 },
];

// ── Утилиты ───────────────────────────────────────────────────────────────────
let phoneCounter = 998901000000;
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
  { teamName: 'AA', start: d(2026,1,15), end: d(2026,1,17) },
  { teamName: 'BB', start: d(2026,1,22), end: d(2026,1,24) },
  { teamName: 'CC', start: d(2026,2,5),  end: d(2026,2,7)  },
  { teamName: 'DD', start: d(2026,2,12), end: d(2026,2,14) },
  { teamName: 'EE', start: d(2026,2,19), end: d(2026,2,21) },
  { teamName: 'FF', start: d(2026,2,26), end: d(2026,2,28) },
  { teamName: 'GG', start: d(2026,3,5),  end: d(2026,3,7)  },
  { teamName: 'HH', start: d(2026,3,12), end: d(2026,3,14) },
];

// ── Основная функция ──────────────────────────────────────────────────────────
async function main() {
  // Дополнительные места
  const [venueAquarium, venueSilk] = await Promise.all([
    p.venue.upsert({
      where: { city_address_venueName: { city: 'Ташкент', address: 'ул. Бунёдкор, 15', venueName: 'Аквариум' } },
      create: { city: 'Ташкент', address: 'ул. Бунёдкор, 15', venueName: 'Аквариум' },
      update: {},
    }),
    p.venue.upsert({
      where: { city_address_venueName: { city: 'Самарканд', address: 'пр. Навои, 5', venueName: 'Шёлковый путь' } },
      create: { city: 'Самарканд', address: 'пр. Навои, 5', venueName: 'Шёлковый путь' },
      update: {},
    }),
  ]);
  const typeKosmetic = await p.presentationType.upsert({
    where: { name: 'Косметика' },
    create: { name: 'Косметика' },
    update: {},
  });

  const venues = [VENUE_ORCHID, venueAquarium.id, venueSilk.id];
  const types  = [TYPE_POSUDA, typeKosmetic.id];

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
          status: def.end < new Date() ? 'CLOSED' : 'PLANNED',
          createdById: ADMIN_ID,
        },
      });
      console.log(`✓ Trip: ${tripName}`);
    } else {
      console.log(`- Trip exists: ${tripName}`);
    }

    // Добавляем ADMIN как LEADER выезда (если ещё нет)
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
              venueId: rnd(venues),
              typeId: rnd(types),
              createdById: ADMIN_ID,
            },
          });
          console.log(`  ✓ Presentation: ${presName}`);
        }

        // Список гостей (один на дату)
        let guestList = await p.guestList.findFirst({
          where: { tripId: trip.id, date: dateStr },
        });
        const guestCount = rndInt(12, 28);
        if (!guestList) {
          guestList = await p.guestList.create({
            data: {
              tripId: trip.id,
              date: dateStr,
              fileName: `${def.teamName}_${dateStr.replace(/-/g,'')}.csv`,
              totalCount: guestCount,
              importedCount: guestCount,
              failedCount: 0,
              duplicatesCount: 0,
              createdById: ADMIN_ID,
            },
          });
          console.log(`    ✓ GuestList: ${dateStr} (${guestCount} чел.)`);
        }

        // Записи гостей для этой презентации
        const existingCount = await p.guestRecord.count({
          where: { guestListId: guestList.id, presentationId: pres.id },
        });
        if (existingCount === 0) {
          const perSlot = Math.floor(guestCount / TIMES.length);
          const records = [];
          for (let i = 0; i < perSlot; i++) {
            const leftStatus = rnd(LEFT_POOL);
            const pairs = rndInt(0, 2);
            records.push({
              guestListId: guestList.id,
              presentationId: pres.id,
              fullName: fullName(),
              phone: nextPhone(),
              pairsCount: pairs,
              guestsCount: pairs,
              age: rndInt(28, 65),
              couponNumber: `${rndInt(1,3)}${rnd(['в','т','з'])}`,
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

  console.log('\n✅ Demo seed 1 завершён!');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());

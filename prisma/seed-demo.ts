import 'dotenv/config';
import { PrismaClient, TripRole, PaymentType, SaleType, ContractStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding demo data...');

  const password = await bcrypt.hash('demo123', 10);

  // === Получаем admin роль ===
  const adminRole = await prisma.role.findFirst({ where: { name: 'Администратор' } });
  if (!adminRole) throw new Error('Admin role not found. Run seed.ts first!');

  // === 1. Пользователи ===
  console.log('👥 Creating users...');

  const usersData = [
    // Координатор
    { email: 'ivanova@slp.com', firstName: 'Мария', lastName: 'Иванова', middleName: 'Сергеевна', tradeCode: 'MI-001', isCoordinator: true },
    // Лидеры (LEADER)
    { email: 'petrov@slp.com', firstName: 'Алексей', lastName: 'Петров', middleName: 'Иванович', tradeCode: 'AP-002', isCoordinator: false },
    { email: 'sidorov@slp.com', firstName: 'Дмитрий', lastName: 'Сидоров', middleName: 'Александрович', tradeCode: 'DS-003', isCoordinator: false },
    // МВ (MV)
    { email: 'kozlov@slp.com', firstName: 'Сергей', lastName: 'Козлов', middleName: 'Николаевич', tradeCode: 'SK-004', isCoordinator: false },
    { email: 'novikova@slp.com', firstName: 'Анна', lastName: 'Новикова', middleName: 'Петровна', tradeCode: 'AN-005', isCoordinator: false },
    // ГА (GA / MV_GA)
    { email: 'morozov@slp.com', firstName: 'Андрей', lastName: 'Морозов', middleName: 'Викторович', tradeCode: 'AM-006', isCoordinator: false },
    { email: 'volkova@slp.com', firstName: 'Екатерина', lastName: 'Волкова', middleName: 'Олеговна', tradeCode: 'EV-007', isCoordinator: false },
    { email: 'sokolov@slp.com', firstName: 'Иван', lastName: 'Соколов', middleName: 'Дмитриевич', tradeCode: 'IS-008', isCoordinator: false },
    { email: 'popova@slp.com', firstName: 'Ольга', lastName: 'Попова', middleName: 'Андреевна', tradeCode: 'OP-009', isCoordinator: false },
    // Трейдеры
    { email: 'lebedev@slp.com', firstName: 'Николай', lastName: 'Лебедев', middleName: 'Сергеевич', tradeCode: 'NL-010', isCoordinator: false },
    { email: 'kuznetsova@slp.com', firstName: 'Татьяна', lastName: 'Кузнецова', middleName: 'Борисовна', tradeCode: 'TK-011', isCoordinator: false },
    { email: 'smirnov@slp.com', firstName: 'Роман', lastName: 'Смирнов', middleName: 'Геннадьевич', tradeCode: 'RS-012', isCoordinator: false },
    { email: 'fedorova@slp.com', firstName: 'Наталья', lastName: 'Фёдорова', middleName: 'Владимировна', tradeCode: 'NF-013', isCoordinator: false },
    { email: 'orlov@slp.com', firstName: 'Виктор', lastName: 'Орлов', middleName: 'Михайлович', tradeCode: 'VO-014', isCoordinator: false },
    { email: 'nikitin@slp.com', firstName: 'Павел', lastName: 'Никитин', middleName: 'Юрьевич', tradeCode: 'PN-015', isCoordinator: false },
  ];

  const createdUsers: Record<string, any> = {};

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { isCoordinator: u.isCoordinator, roleId: adminRole.id },
      create: {
        email: u.email,
        password,
        firstName: u.firstName,
        lastName: u.lastName,
        middleName: u.middleName,
        tradeCode: u.tradeCode,
        isCoordinator: u.isCoordinator,
        roleId: adminRole.id,
      },
    });
    createdUsers[u.email] = user;
    console.log(`  ✓ ${u.lastName} ${u.firstName}`);
  }

  const coordinator = createdUsers['ivanova@slp.com'];
  const leader1 = createdUsers['petrov@slp.com'];
  const leader2 = createdUsers['sidorov@slp.com'];
  const mv1 = createdUsers['kozlov@slp.com'];
  const mv2 = createdUsers['novikova@slp.com'];
  const ga1 = createdUsers['morozov@slp.com'];
  const ga2 = createdUsers['volkova@slp.com'];
  const ga3 = createdUsers['sokolov@slp.com'];
  const ga4 = createdUsers['popova@slp.com'];
  const trader1 = createdUsers['lebedev@slp.com'];
  const trader2 = createdUsers['kuznetsova@slp.com'];
  const trader3 = createdUsers['smirnov@slp.com'];

  // === 2. Справочник банков ===
  console.log('🏦 Creating banks...');
  const banksData = [
    { name: 'Сбербанк', description: 'ПАО Сбербанк России' },
    { name: 'ВТБ', description: 'Банк ВТБ (ПАО)' },
    { name: 'Альфа-Банк', description: 'АО «Альфа-Банк»' },
    { name: 'Тинькофф', description: 'АО «Тинькофф Банк»' },
    { name: 'Газпромбанк', description: 'Банк ГПБ (АО)' },
    { name: 'Россельхозбанк', description: 'АО «Россельхозбанк»' },
  ];

  const createdBanks: Record<string, any> = {};
  for (const b of banksData) {
    const bank = await prisma.bank.upsert({
      where: { name: b.name },
      update: {},
      create: b,
    });
    createdBanks[b.name] = bank;
  }
  console.log(`  ✓ ${banksData.length} банков`);

  // === 3. Справочник компаний ===
  console.log('🏢 Creating companies...');
  const companiesData = [
    { name: 'АльфаСтрой', description: 'Строительная компания' },
    { name: 'МегаТех', description: 'Технологии и инновации' },
    { name: 'ЭкоПром', description: 'Экологическое производство' },
    { name: 'СтандартПлюс', description: 'Торговая компания' },
  ];

  const createdCompanies: Record<string, any> = {};
  for (const c of companiesData) {
    const company = await prisma.company.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
    createdCompanies[c.name] = company;
  }
  console.log(`  ✓ ${companiesData.length} компаний`);

  // === 4. Типы презентаций ===
  console.log('📋 Creating presentation types...');
  const typeNames = ['Розыгрыш', 'Часовка', 'Демонстрация', 'Корпоратив'];
  const createdTypes: Record<string, any> = {};
  for (const name of typeNames) {
    const t = await prisma.presentationType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    createdTypes[name] = t;
  }

  // === 5. Места проведения ===
  console.log('📍 Creating venues...');
  const venuesData = [
    { city: 'Москва', address: 'ул. Тверская, 15', venueName: 'Центральный зал' },
    { city: 'Москва', address: 'Кутузовский пр., 32', venueName: 'Конференц-холл' },
    { city: 'Санкт-Петербург', address: 'Невский пр., 88', venueName: 'Зал Невский' },
    { city: 'Санкт-Петербург', address: 'ул. Садовая, 22', venueName: 'Бизнес-центр Садовый' },
  ];
  const createdVenues: any[] = [];
  for (const v of venuesData) {
    const venue = await prisma.venue.upsert({
      where: { city_address_venueName: { city: v.city, address: v.address, venueName: v.venueName } },
      update: {},
      create: v,
    });
    createdVenues.push(venue);
  }

  // === 6. Выезды ===
  console.log('🚗 Creating trips...');
  const adminUser = await prisma.user.findFirst({ where: { email: 'admin@slp.com' } });
  if (!adminUser) throw new Error('Admin user not found');

  // Выезд 1: текущий (ACTIVE)
  let trip1 = await prisma.trip.findFirst({ where: { name: 'AA260322' } });
  if (!trip1) {
    trip1 = await prisma.trip.create({
      data: {
        name: 'AA260322',
        teamName: 'AA',
        startDate: new Date('2026-03-22'),
        endDate: new Date('2026-03-28'),
        status: 'ACTIVE',
        coordinatorId: coordinator.id,
        createdById: adminUser.id,
      },
    });
  }

  // Состав выезда 1
  const trip1Crew = [
    { userId: leader1.id, role: TripRole.LEADER },
    { userId: leader2.id, role: TripRole.LEADER },
    { userId: mv1.id, role: TripRole.MV },
    { userId: ga1.id, role: TripRole.GA },
    { userId: ga2.id, role: TripRole.GA },
    { userId: ga3.id, role: TripRole.MV_GA },
    { userId: trader1.id, role: TripRole.TRADER },
    { userId: trader2.id, role: TripRole.TRADER },
    { userId: trader3.id, role: TripRole.TRADER },
  ];
  for (const member of trip1Crew) {
    await prisma.tripCrew.upsert({
      where: { tripId_userId: { tripId: trip1.id, userId: member.userId } },
      update: {},
      create: { tripId: trip1.id, ...member },
    });
  }

  // Банки выезда 1
  const trip1BankNames = ['Сбербанк', 'ВТБ', 'Альфа-Банк', 'Тинькофф'];
  for (const bname of trip1BankNames) {
    await prisma.tripBank.upsert({
      where: { tripId_bankId: { tripId: trip1.id, bankId: createdBanks[bname].id } },
      update: {},
      create: { tripId: trip1.id, bankId: createdBanks[bname].id },
    });
  }

  // Компании выезда 1
  for (const company of Object.values(createdCompanies)) {
    await prisma.tripCompany.upsert({
      where: { tripId_companyId: { tripId: trip1.id, companyId: (company as any).id } },
      update: {},
      create: { tripId: trip1.id, companyId: (company as any).id },
    });
  }

  console.log(`  ✓ Выезд ${trip1.name} (ACTIVE)`);

  // Выезд 2: будущий (PLANNED)
  let trip2 = await prisma.trip.findFirst({ where: { name: 'BB260401' } });
  if (!trip2) {
    trip2 = await prisma.trip.create({
      data: {
        name: 'BB260401',
        teamName: 'BB',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-04-07'),
        status: 'PLANNED',
        coordinatorId: coordinator.id,
        createdById: adminUser.id,
      },
    });
  }

  const trip2Crew = [
    { userId: leader2.id, role: TripRole.LEADER },
    { userId: mv2.id, role: TripRole.MV },
    { userId: ga2.id, role: TripRole.GA },
    { userId: ga4.id, role: TripRole.GA },
    { userId: trader1.id, role: TripRole.TRADER },
  ];
  for (const member of trip2Crew) {
    await prisma.tripCrew.upsert({
      where: { tripId_userId: { tripId: trip2.id, userId: member.userId } },
      update: {},
      create: { tripId: trip2.id, ...member },
    });
  }

  const trip2BankNames = ['Газпромбанк', 'Россельхозбанк', 'Сбербанк'];
  for (const bname of trip2BankNames) {
    await prisma.tripBank.upsert({
      where: { tripId_bankId: { tripId: trip2.id, bankId: createdBanks[bname].id } },
      update: {},
      create: { tripId: trip2.id, bankId: createdBanks[bname].id },
    });
  }

  for (const company of [createdCompanies['АльфаСтрой'], createdCompanies['МегаТех']]) {
    await prisma.tripCompany.upsert({
      where: { tripId_companyId: { tripId: trip2.id, companyId: company.id } },
      update: {},
      create: { tripId: trip2.id, companyId: company.id },
    });
  }

  console.log(`  ✓ Выезд ${trip2.name} (PLANNED)`);

  // === 7. Презентации для выезда 1 ===
  console.log('🎤 Creating presentations...');

  const presDates = ['2026-03-22', '2026-03-23', '2026-03-24', '2026-03-25'];
  const presTimes = ['10:00', '14:00', '18:00'];

  let presCounter = 0;
  const createdPresentations: any[] = [];

  for (const date of presDates) {
    for (let i = 0; i < presTimes.length; i++) {
      presCounter++;
      const time = presTimes[i];
      const venue = createdVenues[presCounter % createdVenues.length];
      const type = Object.values(createdTypes)[presCounter % typeNames.length];

      const pres = await prisma.presentation.upsert({
        where: {
          // Нет уникального ключа кроме id — используем create и проверяем
          id: `pres-demo-${presCounter}`,
        },
        update: {},
        create: {
          id: `pres-demo-${presCounter}`,
          tripId: trip1.id,
          name: `AA ${date.slice(8, 10)}.03.26 #${i + 1}`,
          date: new Date(date),
          time,
          number: i + 1,
          status: new Date(date) < new Date() ? 'COMPLETED' : 'PLANNED',
          typeId: (type as any).id,
          venueId: venue.id,
          coordinatorId: coordinator.id,
          createdById: adminUser.id,
        },
      });

      // Состав презентации — ГА берут Leader из состава выезда
      const leaders = [leader1, leader2];
      const selectedLeader = leaders[presCounter % leaders.length];
      const gaUsers = [ga1, ga2, ga3];
      const selectedGa = gaUsers[presCounter % gaUsers.length];

      const presCrew = [
        { userId: selectedLeader.id, role: TripRole.LEADER },
        { userId: mv1.id, role: TripRole.MV },
        { userId: selectedGa.id, role: TripRole.GA },
        { userId: trader1.id, role: TripRole.TRADER },
      ];

      for (const member of presCrew) {
        await prisma.presentationCrew.upsert({
          where: { presentationId_userId: { presentationId: pres.id, userId: member.userId } },
          update: {},
          create: { presentationId: pres.id, ...member },
        });
      }

      createdPresentations.push({ ...pres, crew: presCrew });
    }
  }

  // Ещё 3 презентации для выезда 2
  for (let i = 0; i < 3; i++) {
    presCounter++;
    const pres = await prisma.presentation.upsert({
      where: { id: `pres-demo-${presCounter}` },
      update: {},
      create: {
        id: `pres-demo-${presCounter}`,
        tripId: trip2.id,
        name: `BB 01.04.26 #${i + 1}`,
        date: new Date('2026-04-01'),
        time: presTimes[i],
        number: i + 1,
        status: 'PLANNED',
        venueId: createdVenues[i % createdVenues.length].id,
        coordinatorId: coordinator.id,
        createdById: adminUser.id,
      },
    });

    const presCrew2 = [
      { userId: leader2.id, role: TripRole.LEADER },
      { userId: mv2.id, role: TripRole.MV },
      { userId: ga4.id, role: TripRole.GA },
    ];
    for (const member of presCrew2) {
      await prisma.presentationCrew.upsert({
        where: { presentationId_userId: { presentationId: pres.id, userId: member.userId } },
        update: {},
        create: { presentationId: pres.id, ...member },
      });
    }
  }

  console.log(`  ✓ ${presCounter} презентаций`);

  // === 8. Списки гостей (по 5-10 записей на первые 3 презентации) ===
  console.log('📝 Creating guest lists...');

  const guestListGuests = [
    ['Абрамов Кирилл', 'Борисова Светлана', 'Васильев Геннадий', 'Громова Ирина', 'Данилов Олег'],
    ['Еремин Тимур', 'Жукова Людмила', 'Зайцев Артём', 'Иванченко Валерия', 'Карпов Евгений'],
    ['Ларина Надежда', 'Морозов Станислав', 'Нечаев Антон', 'Овчинникова Юлия', 'Платонов Роман'],
  ];

  for (let li = 0; li < 3; li++) {
    const pres = createdPresentations[li];
    const presDate = new Date(pres.date);
    const dateStr = `${presDate.getFullYear()}-${String(presDate.getMonth() + 1).padStart(2, '0')}-${String(presDate.getDate()).padStart(2, '0')}`;
    const guestList = await prisma.guestList.create({
      data: {
        tripId: trip1.id,
        date: dateStr,
        fileName: `guests_${li + 1}.csv`,
        totalCount: guestListGuests[li].length,
        importedCount: guestListGuests[li].length,
        createdById: adminUser.id,
      },
    });

    const guests = guestListGuests[li];
    for (let gi = 0; gi < guests.length; gi++) {
      await prisma.guestRecord.create({
        data: {
          guestListId: guestList.id,
          presentationId: pres.id,
          fullName: guests[gi],
          phone: `+7900${String(1000000 + li * 100 + gi).slice(1)}`,
          // Первые 3 — обработаны
          guestsCount: gi < 3 ? gi % 2 : null,
          pairsCount: gi < 3 ? (gi % 2 === 0 ? 1 : 0) : null,
          leftStatus: gi === 1 ? 'ушел' : null,
        },
      });
    }
    console.log(`  ✓ Список ${li + 1}: ${guests.length} гостей`);
  }

  // === 9. Итоги для первых 2 презентаций ===
  console.log('📊 Creating presentation summaries...');
  const summaryData = [
    { presIdx: 0, userId: leader1.id, successApproach: 9, totalApproach: 13, refusalCount: 2, refusalValue: 3, rewriteCount: 1, rewriteValue: 2 },
    { presIdx: 1, userId: leader2.id, successApproach: 7, totalApproach: 11, refusalCount: 3, refusalValue: 4, rewriteCount: 2, rewriteValue: 3 },
  ];

  for (const s of summaryData) {
    const pres = createdPresentations[s.presIdx];
    const { presIdx, ...summaryFields } = s;
    await prisma.presentationSummary.upsert({
      where: { presentationId_userId: { presentationId: pres.id, userId: summaryFields.userId } },
      update: summaryFields,
      create: { presentationId: pres.id, ...summaryFields },
    });
  }
  console.log(`  ✓ Итоги для 2 презентаций`);

  // === 10. Договора ===
  console.log('📄 Creating contracts...');

  // Генератор номера договора как в сервисе: DDMMYY/NП-SEQ
  const makeContractNumber = async (presId: string, date: Date): Promise<string> => {
    const pres = await prisma.presentation.findUnique({ where: { id: presId }, select: { number: true } });
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const count = await prisma.contract.count({ where: { contractDate: { gte: dayStart, lt: dayEnd } } });
    const seq = String(count + 1).padStart(3, '0');
    return `${dd}${mm}${yy}/${pres!.number}П-${seq}`;
  };

  const contractsData = [
    // Договор 1 — Наличными, розыгрыш
    {
      presIdx: 0,
      clientName: 'Громов Игорь Сергеевич',
      contractDate: new Date('2026-03-22'),
      companyKey: 'АльфаСтрой',
      paymentType: PaymentType.CASH,
      saleType: SaleType.RAFFLE,
      signedBy: ga1,
      speakerIdx: 0, // leader1
      totalAmount: 150000,
      advanceCash: 50000,
      bankKeys: ['Сбербанк'],
      status: ContractStatus.VERIFIED,
      phones: [{ countryCode: '+7', number: '9161234567' }],
      registrationAddress: 'г. Москва, ул. Ленина, 12-45',
    },
    // Договор 2 — Кредит, часовка
    {
      presIdx: 0,
      clientName: 'Захарова Татьяна Михайловна',
      contractDate: new Date('2026-03-22'),
      companyKey: 'МегаТех',
      paymentType: PaymentType.CREDIT,
      saleType: SaleType.HOURLY,
      signedBy: ga2,
      speakerIdx: 0,
      totalAmount: 250000,
      advanceCash: 30000,
      advanceTerminal: 20000,
      bankKeys: ['ВТБ', 'Альфа-Банк'],
      status: ContractStatus.UNVERIFIED,
      phones: [{ countryCode: '+7', number: '9037654321' }, { countryCode: '+7', number: '9269876543' }],
    },
    // Договор 3 — Компания с рассрочкой
    {
      presIdx: 1,
      clientName: 'Морозова Светлана Викторовна',
      contractDate: new Date('2026-03-22'),
      companyKey: 'ЭкоПром',
      paymentType: PaymentType.COMPANY,
      signedBy: ga1,
      speakerIdx: 1, // leader2
      totalAmount: 360000,
      advanceCash: 60000,
      bankKeys: ['Тинькофф'],
      installmentMonths: 6,
      firstPaymentDate: new Date('2026-04-22'),
      status: ContractStatus.UNVERIFIED,
      phones: [{ countryCode: '+7', number: '9151112233' }],
      registrationAddress: 'г. Санкт-Петербург, Невский пр., 100-12',
      actualAddress: 'г. Санкт-Петербург, ул. Садовая, 55-3',
    },
    // Договор 4 — Смешанный
    {
      presIdx: 1,
      clientName: 'Никифоров Борис Андреевич',
      contractDate: new Date('2026-03-23'),
      companyKey: 'СтандартПлюс',
      paymentType: PaymentType.MIXED,
      signedBy: ga3,
      speakerIdx: 0,
      totalAmount: 180000,
      advanceCash: 50000,
      advanceTerminal: 30000,
      advanceBank: 20000,
      bankKeys: ['Газпромбанк'],
      status: ContractStatus.VERIFIED,
      phones: [{ countryCode: '+7', number: '9299998877' }],
    },
    // Договор 5 — Терминал
    {
      presIdx: 2,
      clientName: 'Орлова Валентина Николаевна',
      contractDate: new Date('2026-03-23'),
      companyKey: 'АльфаСтрой',
      paymentType: PaymentType.TERMINAL,
      signedBy: ga2,
      speakerIdx: 1,
      totalAmount: 120000,
      advanceTerminal: 120000,
      bankKeys: ['Сбербанк', 'Россельхозбанк'],
      status: ContractStatus.UNVERIFIED,
      phones: [{ countryCode: '+998', number: '901234567' }],
    },
    // Договор 6 — Резервация
    {
      presIdx: 3,
      clientName: 'Соловьёв Константин Петрович',
      contractDate: new Date('2026-03-24'),
      paymentType: PaymentType.RESERVATION,
      signedBy: ga3,
      speakerIdx: 0,
      totalAmount: 200000,
      bankKeys: ['ВТБ'],
      status: ContractStatus.UNVERIFIED,
      phones: [{ countryCode: '+7', number: '9054443322' }, { countryCode: '+7', number: '9185556677' }],
      registrationAddress: 'г. Москва, Кутузовский пр., 20-8',
    },
    // Договор 7 — Кредит без типа продажи
    {
      presIdx: 4,
      clientName: 'Миронова Юлия Александровна',
      contractDate: new Date('2026-03-24'),
      companyKey: 'МегаТех',
      paymentType: PaymentType.CREDIT,
      signedBy: ga1,
      speakerIdx: 1,
      totalAmount: 320000,
      advanceCash: 70000,
      bankKeys: ['Альфа-Банк', 'Тинькофф'],
      status: ContractStatus.VERIFIED,
      phones: [{ countryCode: '+7', number: '9177778899' }],
    },
    // Договор 8 — Компания с рассрочкой 12 мес
    {
      presIdx: 5,
      clientName: 'Фёдоров Александр Игоревич',
      contractDate: new Date('2026-03-25'),
      companyKey: 'СтандартПлюс',
      paymentType: PaymentType.COMPANY,
      saleType: SaleType.HOURLY,
      signedBy: ga2,
      speakerIdx: 0,
      totalAmount: 480000,
      advanceCash: 80000,
      advanceBank: 40000,
      bankKeys: ['Сбербанк'],
      installmentMonths: 12,
      firstPaymentDate: new Date('2026-05-01'),
      status: ContractStatus.UNVERIFIED,
      phones: [{ countryCode: '+7', number: '9252223344' }],
      registrationAddress: 'г. Москва, ул. Тверская, 50-100',
      actualAddress: 'г. Москва, ул. Тверская, 50-100',
    },
  ];

  const leaders = [leader1, leader2];

  for (const c of contractsData) {
    const pres = createdPresentations[c.presIdx];
    if (!pres) continue;

    const contractNumber = await makeContractNumber(pres.id, c.contractDate);
    const speaker = leaders[c.speakerIdx];
    const bankIds = (c.bankKeys || []).map((k: string) => createdBanks[k]?.id).filter(Boolean);
    const company = c.companyKey ? createdCompanies[c.companyKey] : null;

    // График платежей для COMPANY
    let paymentSchedule: { date: Date; amount: number; order: number }[] = [];
    if (c.paymentType === PaymentType.COMPANY && c.installmentMonths && c.firstPaymentDate) {
      const balance = c.totalAmount - (c.advanceCash || 0) - (c.advanceTerminal || 0) - (c.advanceBank || 0);
      const perMonth = Math.round(balance / c.installmentMonths);
      for (let i = 0; i < c.installmentMonths; i++) {
        const d = new Date(c.firstPaymentDate);
        d.setMonth(d.getMonth() + i);
        paymentSchedule.push({
          date: d,
          amount: i === c.installmentMonths - 1 ? balance - perMonth * (c.installmentMonths - 1) : perMonth,
          order: i,
        });
      }
    }

    await prisma.contract.create({
      data: {
        contractNumber,
        clientName: c.clientName,
        contractDate: c.contractDate,
        companyId: company?.id || null,
        paymentType: c.paymentType,
        saleType: c.saleType || null,
        presentationId: pres.id,
        tripId: trip1.id,
        speakerId: speaker.id,
        signedById: c.signedBy.id,
        createdById: adminUser.id,
        totalAmount: c.totalAmount,
        advanceCash: c.advanceCash || null,
        advanceTerminal: c.advanceTerminal || null,
        advanceBank: c.advanceBank || null,
        installmentMonths: c.installmentMonths || null,
        firstPaymentDate: c.firstPaymentDate || null,
        registrationAddress: c.registrationAddress || null,
        actualAddress: c.actualAddress || null,
        status: c.status,
        banks: bankIds.length ? { create: bankIds.map((bankId: string) => ({ bankId })) } : undefined,
        phones: { create: c.phones.map((p: any, i: number) => ({ ...p, order: i })) },
        paymentSchedule: paymentSchedule.length ? { create: paymentSchedule } : undefined,
      },
    });

    console.log(`  ✓ ${contractNumber} — ${c.clientName}`);
  }
  console.log(`  ✓ Итого: ${contractsData.length} договоров`);

  console.log('');
  console.log('✅ Demo seed completed!');
  console.log('');
  console.log('📋 Созданные пользователи (пароль: demo123):');
  for (const u of usersData) {
    console.log(`  ${u.email.padEnd(28)} — ${u.lastName} ${u.firstName} [${u.tradeCode}]${u.isCoordinator ? ' (координатор)' : ''}`);
  }
  console.log('');
  console.log(`🚗 Выезды: ${trip1.name} (ACTIVE), ${trip2.name} (PLANNED)`);
  console.log(`🎤 Презентаций: ${presCounter}`);
  console.log(`🏦 Банков: ${banksData.length} | 🏢 Компаний: ${companiesData.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

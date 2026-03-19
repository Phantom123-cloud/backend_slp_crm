import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // === 0. Remove deprecated permissions ===
  const deprecated = ['trips.view', 'presentations.view', 'warehouses.view', 'directories.manage'];
  for (const slug of deprecated) {
    const perm = await prisma.permission.findUnique({ where: { slug } });
    if (perm) {
      await prisma.rolePermission.deleteMany({ where: { permissionId: perm.id } });
      await prisma.permission.delete({ where: { slug } });
      console.log(`🗑️  Removed deprecated permission: ${slug}`);
    }
  }

  // === 1. Permissions ===
  const permissions = [
    // Users
    { name: 'Создание пользователей', slug: 'users.create', group: 'users', description: 'Создание пользователей' },
    { name: 'Просмотр пользователей', slug: 'users.view', group: 'users', description: 'Просмотр пользователей' },
    { name: 'Редактирование профиля', slug: 'users.edit_profile', group: 'users', description: 'Редактирование профиля пользователя (ФИО, контакты, языки и т.д.)' },
    { name: 'Редактирование настроек', slug: 'users.edit_settings', group: 'users', description: 'Редактирование email, пароля, роли' },
    { name: 'Блокировка пользователей', slug: 'users.block', group: 'users', description: 'Блокировка / разблокировка пользователей' },
    { name: 'Принудительный выход', slug: 'users.force_logout', group: 'users', description: 'Принудительное завершение сессии пользователя' },
    // Roles
    { name: 'Создание ролей', slug: 'roles.create', group: 'roles', description: 'Создание ролей' },
    { name: 'Просмотр ролей', slug: 'roles.view', group: 'roles', description: 'Просмотр ролей' },
    { name: 'Редактирование ролей', slug: 'roles.edit', group: 'roles', description: 'Редактирование ролей' },
    { name: 'Удаление ролей', slug: 'roles.delete', group: 'roles', description: 'Удаление ролей' },
    // Audit
    { name: 'Просмотр логов', slug: 'audit.view', group: 'audit', description: 'Просмотр логов' },
    // User Documents
    { name: 'Просмотр документов пользователей', slug: 'user_docs.view', group: 'user_docs', description: 'Просмотр документов пользователей' },
    { name: 'Загрузка документов пользователей', slug: 'user_docs.upload', group: 'user_docs', description: 'Загрузка документов пользователей' },
    { name: 'Удаление документов пользователей', slug: 'user_docs.delete', group: 'user_docs', description: 'Удаление документов пользователей' },
    // Session
    { name: 'Настройка лимита одновременных сессий', slug: 'session.manage', group: 'session', description: 'Настройка лимита одновременных сессий для любого аккаунта' },
    // Trips
    { name: 'Просмотр всех поездок', slug: 'trips.view-all', group: 'trips', description: 'Просмотр всех поездок в системе вне зависимости от участия' },
    { name: 'Просмотр своих поездок', slug: 'trips.view-person', group: 'trips', description: 'Просмотр поездок, в которых пользователь является членом команды, координатором или создателем' },
    { name: 'Создание поездок', slug: 'trips.create', group: 'trips', description: 'Создание новых поездок' },
    { name: 'Редактирование поездок', slug: 'trips.edit', group: 'trips', description: 'Редактирование поездок, состава и координатора' },
    { name: 'Удаление поездок', slug: 'trips.delete', group: 'trips', description: 'Удаление поездок' },
    { name: 'Администрирование поездок', slug: 'trips.admin', group: 'trips', description: 'Открытие/закрытие поездок, редактирование закрытых' },
    // Presentations
    { name: 'Просмотр всех презентаций', slug: 'presentations.view-all', group: 'presentations', description: 'Просмотр всех презентаций в системе вне зависимости от участия' },
    { name: 'Просмотр своих презентаций', slug: 'presentations.view-person', group: 'presentations', description: 'Просмотр презентаций, в которых пользователь является членом состава' },
    { name: 'Создание презентаций', slug: 'presentations.create', group: 'presentations', description: 'Создание презентаций' },
    { name: 'Редактирование презентаций', slug: 'presentations.edit', group: 'presentations', description: 'Редактирование презентаций и состава' },
    { name: 'Удаление презентаций', slug: 'presentations.delete', group: 'presentations', description: 'Удаление/отмена презентаций' },
    // Directories
    { name: 'Просмотр справочников', slug: 'directories.view', group: 'directories', description: 'Просмотр справочников: типы презентаций, товары, места, типы расходов' },
    { name: 'Добавление в справочники', slug: 'directories.create', group: 'directories', description: 'Добавление новых записей во все справочники' },
    { name: 'Редактирование справочников', slug: 'directories.edit', group: 'directories', description: 'Редактирование записей в справочниках' },
    { name: 'Удаление из справочников', slug: 'directories.delete', group: 'directories', description: 'Удаление записей из справочников' },
    // Warehouses
    { name: 'Просмотр всех складов', slug: 'warehouses.view-all', group: 'warehouses', description: 'Просмотр всех складов в системе' },
    { name: 'Просмотр своих складов', slug: 'warehouses.view-person', group: 'warehouses', description: 'Просмотр складов, где назначен ответственным (только просмотр)' },
    { name: 'Создание складов', slug: 'warehouses.create', group: 'warehouses', description: 'Создание центральных и личных складов' },
    { name: 'Редактирование складов', slug: 'warehouses.edit', group: 'warehouses', description: 'Смена ответственного, переименование, редактирование примечания транзакций' },
    { name: 'Транзакции по своим складам', slug: 'warehouses.transaction', group: 'warehouses', description: 'Транзакции на складах, где назначен ответственным' },
    { name: 'Управление складами', slug: 'warehouses.manage', group: 'warehouses', description: 'Полное управление всеми складами' },
    // Wallets
    { name: 'Просмотр всех кошельков', slug: 'wallets.view-all', group: 'wallets', description: 'Просмотр всех кошельков в системе' },
    { name: 'Просмотр своих кошельков', slug: 'wallets.view-person', group: 'wallets', description: 'Просмотр кошельков, где назначен ответственным' },
    { name: 'Создание кошельков', slug: 'wallets.create', group: 'wallets', description: 'Создание личных кошельков' },
    { name: 'Редактирование кошельков', slug: 'wallets.edit', group: 'wallets', description: 'Смена ответственного, переименование, редактирование деталей транзакций (описание, тип, фото)' },
    { name: 'Транзакции по своим кошелькам', slug: 'wallets.transaction', group: 'wallets', description: 'Транзакции в кошельках/конвертации/переводы, где назначен ответственным' },
    { name: 'Управление кошельками', slug: 'wallets.manage', group: 'wallets', description: 'Полное управление всеми кошельками' },
    { name: 'Аудитор кошельков', slug: 'wallets.auditor', group: 'wallets', description: 'Закрытие транзакций (блокировка редактирования)' },
    // Guest Lists
    { name: 'Просмотр всех списков гостей', slug: 'guest_lists.view-all', group: 'guest_lists', description: 'Просмотр всех списков гостей в системе, скачивание файлов, история импорта' },
    { name: 'Просмотр своих списков гостей', slug: 'guest_lists.view-person', group: 'guest_lists', description: 'Просмотр списков гостей выездов, в которых пользователь является членом команды, скачивание файлов, история импорта' },
    { name: 'Создание списков гостей', slug: 'guest_lists.create', group: 'guest_lists', description: 'Импорт CSV и создание списков гостей' },
    { name: 'Заполнение списков гостей', slug: 'guest_lists.fill', group: 'guest_lists', description: 'Заполнение отметок по гостям вручную, редактирование записей' },
    { name: 'Удаление из списков гостей', slug: 'guest_lists.delete', group: 'guest_lists', description: 'Удаление записей гостей вручную и через файл с телефонами' },
  ];

  const createdPerms: Record<string, string> = {};
  for (const p of permissions) {
    const perm = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: { name: p.name, group: p.group, description: p.description },
      create: p,
    });
    createdPerms[p.slug] = perm.id;
  }

  // === 2. Roles ===
  const allPermsIds = Object.values(createdPerms);

  const adminRole = await prisma.role.upsert({
    where: { name: 'Администратор' },
    update: {},
    create: { name: 'Администратор', description: 'Полный доступ ко всему' },
  });

  // Привязываем все permissions к admin
  for (const permId of allPermsIds) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permId } },
      update: {},
      create: { roleId: adminRole.id, permissionId: permId },
    });
  }

  const viewerRole = await prisma.role.upsert({
    where: { name: 'Просмотр' },
    update: {},
    create: { name: 'Просмотр', description: 'Только просмотр' },
  });

  const viewPerms = Object.entries(createdPerms)
    .filter(([slug]) => slug.endsWith('.view'))
    .map(([, id]) => id);

  for (const permId of viewPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: viewerRole.id, permissionId: permId } },
      update: {},
      create: { roleId: viewerRole.id, permissionId: permId },
    });
  }

  // === 3. Admin User ===
  const hashedPassword = await bcrypt.hash('admin123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@slp.com' },
    update: { roleId: adminRole.id },
    create: {
      email: 'admin@slp.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'SLP',
      roleId: adminRole.id,
    },
  });

  // Cleanup deprecated permissions
  await prisma.permission.deleteMany({
    where: { slug: { in: ['files.view', 'files.upload', 'files.delete', 'users.edit', 'users.delete'] } },
  });

  console.log('✅ Seed completed!');
  console.log('');
  console.log('Admin credentials:');
  console.log('  Email: admin@slp.com');
  console.log('  Password: admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

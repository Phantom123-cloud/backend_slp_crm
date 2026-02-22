import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

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
  ];

  const createdPerms: Record<string, string> = {};
  for (const p of permissions) {
    const perm = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: { name: p.name, group: p.group },
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

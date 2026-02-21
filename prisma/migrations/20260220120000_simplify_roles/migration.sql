-- Упрощение системы ролей: 6 сущностей -> 3

-- 1. Добавляем колонку group в permissions (заполним из permission_types)
ALTER TABLE "permissions" ADD COLUMN "group" TEXT;

-- 2. Заполняем group из permission_types
UPDATE "permissions" p
SET "group" = pt."name"
FROM "permission_types" pt
WHERE p."typeId" = pt."id";

-- Ставим дефолт для тех, у кого нет типа
UPDATE "permissions" SET "group" = 'other' WHERE "group" IS NULL;

-- Делаем NOT NULL
ALTER TABLE "permissions" ALTER COLUMN "group" SET NOT NULL;

-- 3. Добавляем roleId в users
ALTER TABLE "users" ADD COLUMN "roleId" TEXT;

-- 4. Мигрируем данные: для каждого юзера берём первую роль из его шаблона
UPDATE "users" u
SET "roleId" = sub."roleId"
FROM (
  SELECT DISTINCT ON (rt."templateId")
    rt."templateId",
    rt."roleId"
  FROM "role_template_roles" rt
  ORDER BY rt."templateId", rt."roleId"
) sub
JOIN "role_templates" tmpl ON tmpl."id" = sub."templateId"
WHERE u."roleTemplateId" = tmpl."id";

-- 5. Добавляем FK constraint для roleId
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Удаляем FK constraint roleTemplateId
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_roleTemplateId_fkey";

-- 7. Удаляем колонку roleTemplateId
ALTER TABLE "users" DROP COLUMN "roleTemplateId";

-- 8. Удаляем таблицы в правильном порядке (зависимости)
DROP TABLE IF EXISTS "user_permission_overrides";
DROP TABLE IF EXISTS "role_template_roles";
DROP TABLE IF EXISTS "role_templates";

-- 9. Убираем FK typeId из permissions
ALTER TABLE "permissions" DROP CONSTRAINT IF EXISTS "permissions_typeId_fkey";
ALTER TABLE "permissions" DROP COLUMN "typeId";

-- 10. Удаляем permission_types
DROP TABLE IF EXISTS "permission_types";

-- 11. Удаляем templateRoles из roles (уже удалено через role_template_roles)
-- Ничего делать не нужно — связь была через role_template_roles

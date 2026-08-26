-- Seed: Create super admin user (idempotent, reproducible)
-- Email:   superadmin@duka.dev
-- Password: DukaAdmin#rG2HCNf3ycJ539  (bcrypt hash below)
-- Run with: psql "$DATABASE_URL" -f prisma/migrations/20260827120000_seed_admin/migration.sql
--           or: npx prisma db execute --file prisma/migrations/20260827120000_seed_admin/migration.sql --schema prisma/schema.prisma

DO $$
DECLARE
  v_role_id UUID;
  v_user_id UUID;
BEGIN
  INSERT INTO roles (id, name, description, "isSystem", "createdAt")
  VALUES (gen_random_uuid(), 'super_admin', 'Super administrator with full access', true, now())
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO v_role_id;

  INSERT INTO role_permissions (id, "roleId", "permissionId")
  SELECT gen_random_uuid(), v_role_id, p.id FROM permissions p
  ON CONFLICT ("roleId", "permissionId") DO NOTHING;

  INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", status, "emailVerified")
  VALUES (
    gen_random_uuid(),
    'superadmin@duka.dev',
    '$2b$12$Hbrvv2Mzyl0nSc5/wH0KRuFoLd9MN.L1mDhoCcKbv94.KSGkb5tKO',
    'Super',
    'Admin',
    'active',
    true
  )
  ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", status = EXCLUDED.status, "emailVerified" = EXCLUDED."emailVerified"
  RETURNING id INTO v_user_id;

  INSERT INTO user_roles ("userId", "roleId", "tenantId")
  VALUES (v_user_id, v_role_id, NULL)
  ON CONFLICT ("userId", "roleId", "tenantId") DO NOTHING;
END $$;

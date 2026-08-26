const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@duka.dev';
// Bootstrap default. Override with SUPER_ADMIN_PASSWORD / SUPER_ADMIN_EMAIL env vars.
// Rotate this credential after first login and avoid committing real secrets.
const BOOTSTRAP_PASSWORD = 'DukaAdmin#rG2HCNf3ycJ539';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 14; i++) {
    suffix += alphabet[crypto.randomInt(alphabet.length)];
  }
  return `DukaAdmin#${suffix}`;
}

const prisma = new PrismaClient();

async function main() {
  const password = SUPER_ADMIN_PASSWORD || BOOTSTRAP_PASSWORD;
  const hash = bcrypt.hashSync(password, 12);

  // Ensure super_admin role exists
  const role = await prisma.role.upsert({
    where: { name: 'super_admin' },
    update: { description: 'Super administrator with full access', isSystem: true },
    create: {
      name: 'super_admin',
      description: 'Super administrator with full access',
      isSystem: true,
    },
  });

  // Grant ALL permissions to super_admin so it can access every admin endpoint
  const permissions = await prisma.permission.findMany();
  for (const p of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      update: {},
      create: { roleId: role.id, permissionId: p.id },
    });
  }

  // Create / update the super admin user
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash: hash, status: 'active', emailVerified: true },
    create: {
      email: EMAIL,
      passwordHash: hash,
      firstName: 'Super',
      lastName: 'Admin',
      status: 'active',
      emailVerified: true,
    },
  });

  // Assign the super_admin role (platform-wide, no tenant scope)
  await prisma.userRole.upsert({
    where: {
      userId_roleId_tenantId: { userId: user.id, roleId: role.id, tenantId: null },
    },
    update: {},
    create: { userId: user.id, roleId: role.id, tenantId: null },
  });

  // Rewrite the previously-broken migration file into a correct, idempotent one
  const migrationDir = path.join(
    __dirname,
    '..',
    'prisma',
    'migrations',
    '20260827120000_seed_admin',
  );
  fs.mkdirSync(migrationDir, { recursive: true });
  const migrationSql = `-- Seed: Create super admin user (idempotent, reproducible)
-- Password hash below is a bcrypt hash of the bootstrap super-admin password.
-- To change credentials, update the user's passwordHash or run with SUPER_ADMIN_PASSWORD.

DO $$
DECLARE
  v_role_id UUID;
  v_user_id UUID;
BEGIN
  INSERT INTO roles (id, name, guard, description, "isSystem", "createdAt")
  VALUES (gen_random_uuid(), 'super_admin', 'rbac', 'Super administrator with full access', true, now())
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO v_role_id;

  INSERT INTO role_permissions (id, "roleId", "permissionId")
  SELECT gen_random_uuid(), v_role_id, p.id FROM permissions p
  ON CONFLICT ("roleId", "permissionId") DO NOTHING;

  INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", status, "emailVerified")
  VALUES (gen_random_uuid(), '${EMAIL}', '${hash}', 'Super', 'Admin', 'active', true)
  ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", status = EXCLUDED.status, "emailVerified" = EXCLUDED."emailVerified"
  RETURNING id INTO v_user_id;

  INSERT INTO user_roles ("userId", "roleId", "tenantId")
  VALUES (v_user_id, v_role_id, NULL)
  ON CONFLICT ("userId", "roleId", "tenantId") DO NOTHING;
END $$;
`;
  fs.writeFileSync(path.join(migrationDir, 'migration.sql'), migrationSql);

  console.log('--- SUPER ADMIN CREATED ---');
  console.log(`EMAIL=${EMAIL}`);
  console.log(`PASSWORD=${password}`);
  console.log(`PERMISSIONS_GRANTED=${permissions.length}`);
  console.log(`MIGRATION_WRITTEN=${path.join(migrationDir, 'migration.sql')}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

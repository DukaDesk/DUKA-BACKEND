-- Separate the Platform Operator and Operations platform roles.
-- Previously the app folded platform_operator -> 'operations' (mapRoleToDbName),
-- so every Platform Operator was stored under the 'operations' DB role and no
-- distinct 'platform_operator' role existed.

INSERT INTO roles (id, name, description, "isSystem", "createdAt")
VALUES (
  gen_random_uuid(),
  'platform_operator',
  'Platform operator — merchants, marketplace, platform configuration',
  true,
  now()
)
ON CONFLICT (name) DO NOTHING;

-- Drop any operations assignment for users who already hold platform_operator,
-- to avoid violating the (userId, roleId, tenantId) unique constraint below.
DELETE FROM user_roles ur
WHERE ur."tenantId" IS NULL
  AND ur."roleId" = (SELECT id FROM roles WHERE name = 'operations')
  AND EXISTS (
    SELECT 1 FROM user_roles p
    WHERE p."userId" = ur."userId"
      AND p."tenantId" IS NULL
      AND p."roleId" = (SELECT id FROM roles WHERE name = 'platform_operator')
  );

-- Migrate existing global 'operations' assignments (which were really Platform
-- Operators) to the new, distinct platform_operator role.
UPDATE user_roles
SET "roleId" = (SELECT id FROM roles WHERE name = 'platform_operator')
WHERE "tenantId" IS NULL
  AND "roleId" = (SELECT id FROM roles WHERE name = 'operations');

-- App-submission review permission for the Operations role.
INSERT INTO permissions (id, name, resource, action, description, "createdAt")
VALUES (
  gen_random_uuid(),
  'merchant-apps:review',
  'merchant-apps',
  'review',
  'Review merchant app submissions',
  now()
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (id, "roleId", "permissionId")
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('super_admin', 'operations')
  AND p.name = 'merchant-apps:review'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

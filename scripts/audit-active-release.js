const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const findings = [];

function report(severity, area, message) {
  findings.push({ severity, area, message });
  console.log(`${severity.padEnd(5)} [${area}] ${message}`);
}

function assertReadOnly(sql) {
  const trimmed = sql.trim().replace(/^\(+/, '').trim();
  if (!/^select\b/i.test(trimmed)) {
    throw new Error(`Refusing non-SELECT statement: ${trimmed.slice(0, 60)}`);
  }
  return prisma.$queryRawUnsafe(sql);
}

async function selectOne(sql) {
  const rows = await assertReadOnly(sql);
  return rows[0] || null;
}

async function existsTable(table) {
  const row = await selectOne(
    `SELECT to_regclass('public.${table}')::text AS reg`,
  );
  return Boolean(row && row.reg);
}

async function existsColumn(table, column) {
  const row = await selectOne(
    `SELECT count(*)::int AS n FROM information_schema.columns
     WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}'`,
  );
  return Boolean(row && row.n > 0);
}

async function localChecksums() {
  const dir = path.join(__dirname, '..', 'prisma', 'migrations');
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    const raw = crypto.createHash('sha256').update(buf).digest('hex');
    const lf = crypto.createHash('sha256').update(buf.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
    out.set(name, { raw, lf });
  }
  return out;
}

async function auditMigrationState() {
  console.log('\n== Migration ledger ==');
  if (!(await existsTable('_prisma_migrations'))) {
    report('ERROR', 'ledger', '_prisma_migrations does not exist - migrate deploy cannot start');
    return;
  }
  const rows = await assertReadOnly(
    `SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
     FROM _prisma_migrations ORDER BY migration_name`,
  );
  const local = await localChecksums();

  if (rows.length === 0) {
    report('INFO', 'ledger', 'ledger is empty - next migrate deploy starts from the first migration');
  }

  for (const row of rows) {
    if (row.rolled_back_at) {
      report('WARN', 'ledger', `${row.migration_name} is marked rolled back and will be re-applied`);
      continue;
    }
    if (!row.finished_at) {
      report('ERROR', 'ledger', `${row.migration_name} is in a failed/pending state (finished_at is null) - block deploy until recovered`);
    }
    const file = local.get(row.migration_name);
    if (!file) {
      report('WARN', 'ledger', `${row.migration_name} is recorded but missing from prisma/migrations`);
      continue;
    }
    if (row.checksum !== file.raw && row.checksum !== file.lf) {
      report('ERROR', 'ledger', `${row.migration_name} checksum mismatch - migrate deploy will fail with P3009`);
    }
  }

  const recorded = new Set(rows.map((r) => r.migration_name));
  for (const name of local.keys()) {
    if (!recorded.has(name)) {
      report('INFO', 'ledger', `${name} not yet recorded - will be applied by the next migrate deploy`);
    }
  }
}

async function auditActiveReleaseSchema() {
  console.log('\n== Active release schema ==');
  const hasColumn = await existsColumn('tenants', 'activeReleaseId');
  if (!hasColumn) {
    report('WARN', 'schema', 'tenants.activeReleaseId is absent - migration 20260924000000_add_active_release has not applied');
    return false;
  }
  report('INFO', 'schema', 'tenants.activeReleaseId present');
  const idx = await selectOne(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='tenants_activeReleaseId_idx'`,
  );
  if (!idx) report('WARN', 'schema', 'index tenants_activeReleaseId_idx is missing');
  else report('INFO', 'schema', 'index tenants_activeReleaseId_idx present');
  return true;
}

async function auditPointerIntegrity(hasColumn) {
  console.log('\n== Pointer integrity ==');
  if (!hasColumn) {
    report('WARN', 'pointer', 'skipped - column absent');
    return;
  }

  const backfill = await assertReadOnly(
    `SELECT t.id, t.slug, t.status::text AS status
     FROM tenants t
     WHERE t."activeReleaseId" IS NULL
       AND EXISTS (
         SELECT 1 FROM releases r
         WHERE r."tenantId" = t.id AND r.status = 'published' AND r.channel = 'production'
       )
     ORDER BY t.slug`,
  );
  if (backfill.length === 0) report('INFO', 'backfill', 'no tenant is missing a pointer to an existing published production release');
  for (const t of backfill) report('ERROR', 'backfill', `tenant ${t.slug} has a published production release but activeReleaseId is null`);

  const dangling = await assertReadOnly(
    `SELECT t.slug, t."activeReleaseId", r."tenantId" AS release_tenant, r.status AS release_status, r.channel AS release_channel
     FROM tenants t
     LEFT JOIN releases r ON r.id = t."activeReleaseId"
     WHERE t."activeReleaseId" IS NOT NULL
       AND (r.id IS NULL OR r."tenantId" <> t.id OR r.status <> 'published' OR r.channel <> 'production')`,
  );
  if (dangling.length === 0) report('INFO', 'pointer', 'no dangling or cross-tenant activeReleaseId pointers');
  for (const t of dangling) {
    const reason = t.release_tenant
      ? t.release_tenant !== undefined
        ? `points at a ${t.release_status}/${t.release_channel} release owned by another tenant`
        : 'invalid'
      : 'points at a release that does not exist';
    report('ERROR', 'pointer', `tenant ${t.slug} activeReleaseId=${t.activeReleaseId} ${reason}`);
  }

  const multiple = await assertReadOnly(
    `SELECT t.slug, count(*)::int AS published_production_releases
     FROM releases r JOIN tenants t ON t.id = r."tenantId"
     WHERE r.status = 'published' AND r.channel = 'production'
     GROUP BY t.slug HAVING count(*) > 1
     ORDER BY 2 DESC`,
  );
  if (multiple.length === 0) report('INFO', 'versions', 'no tenant has more than one published production release');
  for (const m of multiple) report('WARN', 'versions', `tenant ${m.slug} has ${m.published_production_releases} published production releases (history kept; only the active pointer is served)`);
}

async function auditTenantStatusAlignment() {
  console.log('\n== Tenant status vs releases ==');
  if (!(await existsTable('releases'))) {
    report('WARN', 'status', 'releases table is absent');
    return;
  }

  const publishedWithoutRelease = await assertReadOnly(
    `SELECT slug, status::text AS status FROM tenants
     WHERE status = 'published'
       AND NOT EXISTS (SELECT 1 FROM releases r WHERE r."tenantId" = tenants.id AND r.status = 'published' AND r.channel = 'production')
     ORDER BY slug`,
  );
  for (const t of publishedWithoutRelease) {
    report('WARN', 'status', `tenant ${t.slug} has status=published but no published production release - merchant must re-publish`);
  }

  const releaseWithoutPublishedStatus = await assertReadOnly(
    `SELECT DISTINCT t.slug, t.status::text AS status
     FROM releases r JOIN tenants t ON t.id = r."tenantId"
     WHERE r.status = 'published' AND r.channel = 'production' AND t.status <> 'published'
     ORDER BY 1`,
  );
  for (const t of releaseWithoutPublishedStatus) {
    report('WARN', 'status', `tenant ${t.slug} has a published production release but tenant.status=${t.status}`);
  }

  const stalePublishedAt = await assertReadOnly(
    `SELECT t.slug, t."publishedAt", latest.published_at
     FROM tenants t
     JOIN LATERAL (
       SELECT r."publishedAt" AS published_at FROM releases r
       WHERE r."tenantId" = t.id AND r.status = 'published' AND r.channel = 'production'
       ORDER BY r."publishedAt" DESC, r."buildNumber" DESC LIMIT 1
     ) latest ON true
     WHERE t."publishedAt" IS DISTINCT FROM latest.published_at`,
  );
  for (const t of stalePublishedAt) {
    report('INFO', 'status', `tenant ${t.slug} publishedAt=${t.publishedAt} differs from latest release publishedAt=${t.published_at}`);
  }
}

async function auditManifestShapes() {
  console.log('\n== Manifest shapes ==');
  if (!(await existsTable('releases'))) return;

  const nonObject = await assertReadOnly(
    `SELECT id, version, jsonb_typeof(manifest) AS kind FROM releases
     WHERE manifest IS NOT NULL AND jsonb_typeof(manifest) <> 'object'`,
  );
  for (const r of nonObject) report('ERROR', 'manifest', `release ${r.version} (${r.id}) has a non-object manifest of type ${r.kind}`);

  const arrayScreens = await assertReadOnly(
    `SELECT id, version FROM releases
     WHERE manifest IS NOT NULL AND jsonb_typeof(manifest) = 'object'
       AND jsonb_typeof(manifest->'screens') = 'array'`,
  );
  for (const r of arrayScreens) report('WARN', 'manifest', `release ${r.version} (${r.id}) still uses the legacy array screens shape`);

  if (nonObject.length === 0 && arrayScreens.length === 0) {
    report('INFO', 'manifest', 'all stored manifests use the 1.0.0 object-screen shape');
  }
}

async function auditCounts() {
  console.log('\n== Counts ==');
  const tables = ['tenants', 'releases', 'drafts', 'templates', 'users', 'media'];
  const counts = {};
  for (const table of tables) {
    if (!(await existsTable(table))) {
      counts[table] = null;
      continue;
    }
    const row = await selectOne(`SELECT count(*)::int AS n FROM ${table}`);
    counts[table] = row ? row.n : 0;
  }
  console.log(`      ${JSON.stringify(counts)}`);

  if (counts.releases === 0) {
    report('WARN', 'releases', 'releases table is empty - backfill is a no-op and no tenant can be served an active release until merchants re-publish');
  }
  if (counts.templates === 0) {
    report('WARN', 'templates', 'template catalog is empty - run prisma db seed (preDeploy runs it after migrate deploy)');
  }
  return counts;
}

async function main() {
  const target = (process.env.DATABASE_URL || '').replace(/:[^:@/]+@/, ':***@').split('?')[0];
  console.log(`Active release / migration audit (read-only)`);
  console.log(`Target: ${target}`);
  console.log(`Time:   ${new Date().toISOString()}\n`);

  await auditMigrationState();
  const hasColumn = await auditActiveReleaseSchema();
  await auditPointerIntegrity(hasColumn);
  await auditTenantStatusAlignment();
  await auditManifestShapes();
  const counts = await auditCounts();

  const errors = findings.filter((f) => f.severity === 'ERROR');
  const warnings = findings.filter((f) => f.severity === 'WARN');

  console.log('\n== Summary ==');
  console.log(JSON.stringify({
    errors: errors.length,
    warnings: warnings.length,
    checks: findings.length,
    counts,
    deployed_commit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
  }, null, 2));

  if (errors.length > 0) {
    console.log('\nRESULT: FAIL - resolve every ERROR before treating B4 as verified');
    process.exitCode = 1;
  } else if (warnings.length > 0) {
    console.log('\nRESULT: PASS WITH WARNINGS');
  } else {
    console.log('\nRESULT: PASS');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

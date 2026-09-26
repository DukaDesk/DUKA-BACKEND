# B4 — Active-release migration recovery runbook

**Task:** B4 / P0 — Migration and recovery (KNOWLEDGE-BASE `backend/PUBLISHED_APP_DELIVERY_BACKEND_TODO.md`, KB 0.3.8)
**Owner:** Backend agent
**Status:** recovery sequence defined; production resolve pending go-ahead
**Last updated:** 2026-09-26

## 1. Why production deploys are failing

Deployment `a10c79c6` (2026-09-25, commit `a09b3a2` — "switch preDeployCommand from prisma db push to migrate deploy") **FAILED** in `preDeployCommand`.

Pre-deploy log:

```
8 migrations found in prisma/migrations
Applying migration `20260827120000_seed_admin`
DbError ... code E23502 ... null value in column "updatedAt" of relation "users" violates not-null constraint
Error: P3018
```

Root cause chain:

1. The production schema was created by `prisma db push`, which **never records rows in `_prisma_migrations`**. The ledger had zero rows, so `migrate deploy` started from migration 1.
2. `20260827120000_seed_admin` inserted a super admin without `users.updatedAt` (Prisma `@updatedAt` has no database default) → 23502 → P3018.
3. Commit `edb4b86` fixes that SQL. The fix is not deployed.

After the fix, deploy would still fail: every object from migrations 2–7 already exists (pushed by `db push`), so `ADD COLUMN` / `ADD VALUE` would raise duplicate-object errors, and the edited `seed_admin` file would raise **P3009 checksum mismatch** against the failed row's recorded checksum (`8be7fc43…`).

## 2. Verified production state (read-only, 2026-09-26)

Collected with `railway run node -e …` against the injected `DATABASE_URL`.

| Check | Result |
|-------|--------|
| `_prisma_migrations` rows | 1 — `20260827120000_seed_admin`, `finished_at = null`, `applied_steps_count = 0`, checksum `8be7fc43c6990eae795055340c694700f59a250f35489077f4351c35a33552a` |
| `tenants.activeReleaseId` | **absent** — migration `20260924000000_add_active_release` has never applied |
| `tenants.draftVersion` | present (migration 3 satisfied) |
| `draft_pages` / `draft_sections` / `draft_components` + 3 FKs + indexes | present (migration 3 satisfied) |
| `users.deactivatedAt`, `users.scheduledDeletionAt` | present, nullable (migration 2 satisfied) |
| `"UserStatus"` enum | `active, suspended, deleted, deactivated, pending, rejected` (migrations 2 and 6 satisfied) |
| `"TenantStatus"` enum | `draft, published, suspended, rejected` (migration 7 satisfied) |
| `templates.version`, `media.templateId` + `media_templateId_idx` | present (migrations 4 and 5 satisfied) |
| `releases.capabilityMeta/assetManifest/checksum/buildNumber/channel/status` | present (schema in sync) |
| `releases` rows | **0** |
| `tenants` | 6 — 3 `published`, 2 `draft`, 1 `suspended` |
| `users` | 19 (superadmin present and active) |
| `templates` | 0 (preDeploy aborts before `prisma db seed`) |
| Running deployment | `0e845b94` (2026-09-20) — pre-B1–B6 build |

Migrations 1–7 are satisfied by the pushed schema; only migration 8 is genuinely pending.

## 3. Recovery sequence (run only with explicit approval)

Run from the repository root. `railway run` injects the production `DATABASE_URL`; the local `.env` points at a different, unreachable host, so every command must go through `railway run`.

```bash
railway run npx prisma migrate resolve --applied 20260827120000_seed_admin
railway run npx prisma migrate resolve --applied 20260827130000_add_user_deactivation
railway run npx prisma migrate resolve --applied 20260912000000_add_draft_tables
railway run npx prisma migrate resolve --applied 20260912010000_add_template_version
railway run npx prisma migrate resolve --applied 20260912020000_add_template_media
railway run npx prisma migrate resolve --applied 20260914100000_add_user_status_pending_rejected
railway run npx prisma migrate resolve --applied 20260916150000_add_tenant_status_rejected
railway run npx prisma migrate status
```

Expected `migrate status`: 8 migrations found, 7 applied, 1 pending (`20260924000000_add_active_release`).

Marking `seed_admin` as applied is safe: the super admin already exists (`superadmin@duka.dev`, `status = active`) and the application bootstraps it on startup (`SuperAdminBootstrap`). The corrected SQL in `edb4b86` still matters for fresh databases — verify it there, not in production.

Then push and deploy. `preDeployCommand` (`npx prisma migrate deploy && npx prisma db seed`) applies migration 8 with the backfill and runs the seed (populating the empty template catalog).

## 4. Migration 8 contract

File: `prisma/migrations/20260924000000_add_active_release/migration.sql`

- Additive only: `ALTER TABLE "tenants" ADD COLUMN "activeReleaseId" TEXT`
- Backfill from the latest published production release per tenant (`publishedAt DESC, buildNumber DESC`), only where the column is null
- Index `tenants_activeReleaseId_idx` (non-unique, allows nulls)
- No foreign key — `ActiveReleaseService` tolerates a missing target and falls back to the latest published production release, re-pointing the column

**Rollback:** `ALTER TABLE "tenants" DROP COLUMN "activeReleaseId";`
No data is lost; readers revert to the runtime legacy fallback in `src/shared/releases/active-release.service.ts:81`.

**Expected effect with current data:** backfill updates 0 rows — `releases` is empty, so no tenant has a published production release.

## 5. Post-deploy verification

```bash
railway run node scripts/audit-active-release.js
curl -fsS https://duka-backend-production.up.railway.app/api/v1/health
```

The audit script is read-only (SELECT only, enforced in-process) and exits non-zero on any `ERROR`. It reports: ledger state and checksum drift, `activeReleaseId` presence and index, backfill gaps, dangling/cross-tenant pointers, multiple published production releases, tenant status vs release alignment, manifest shapes, and table counts.

Record here:

| Evidence | Value |
|----------|-------|
| Deployed commit | _pending_ |
| Deployment ID | _pending_ |
| `migrate deploy` result | _pending_ |
| `tenants.activeReleaseId` column present | _pending_ |
| Backfill rows updated | _pending_ (expected 0) |
| `prisma db seed` result | _pending_ |
| Audit script result | _pending_ |
| `/api/v1/health` | _pending_ |

## 6. Known gaps after B4

- `releases` is empty, so no tenant resolves an active release. B8 requires merchants to re-publish after this deploy, then live publish/rollback/read-path/media evidence.
- `scripts/seed-super-admin.js` rewrites `20260827120000_seed_admin/migration.sql` at runtime with the pre-fix SQL; it is not wired into `prisma db seed`, but running it manually would reintroduce the 23502 failure. Do not run it against the migration directory.

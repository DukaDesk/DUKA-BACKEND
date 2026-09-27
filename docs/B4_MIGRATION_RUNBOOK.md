# B4 — Active-release migration recovery runbook

**Task:** B4 / P0 — Migration and recovery (KNOWLEDGE-BASE `backend/PUBLISHED_APP_DELIVERY_BACKEND_TODO.md`, KB 0.3.8)
**Owner:** Backend agent
**Status:** complete — migration recovered, `add_active_release` applied in production, audit passing
**Last updated:** 2026-09-27

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
| Deployed commit | `7cf6845` (runner tsconfig) on deployment `b104f8d2-34c9-4880-819c-46c5bf243c36`, 2026-09-27 09:15 UTC; migration deploy `a00865ae-6b6d-4a06-b003-ad610f55e0bf`, 2026-09-26 19:37 UTC |
| Deployment ID | `b104f8d2-34c9-4880-819c-46c5bf243c36` (SUCCESS) |
| `migrate deploy` result | `a00865ae`: "Applying migration 20260924000000_add_active_release … All migrations have been successfully applied."; `b104f8d2`: "No pending migrations to apply." |
| `tenants.activeReleaseId` column present | yes, plus index `tenants_activeReleaseId_idx` |
| Backfill rows updated | 0 (expected — `releases` was empty) |
| `prisma db seed` result | success — "Seed completed successfully"; permissions **20** (was 0), plans **3** (was 0), templates **3** (was 0), tenant `acme-store`, 20 users |
| Audit script result | PASS WITH WARNINGS, 0 errors / 5 warnings, exit 0 |
| `/api/v1/health` | HTTP 200 |
| Ledger after recovery | 8 migrations found, 7 applied then 8 applied, 0 pending, no checksum mismatches |
| `tenants.activeReleaseId` population | 7 null / 7 tenants — expected while `releases` is empty; readers use the runtime legacy fallback until merchants re-publish (B8) |

### 5.1 What the recovery exposed

1. **Baseline** — seven `migrate resolve --applied` calls; `resolve --applied` on the failed `seed_admin` row inserted a second row and marked the original rolled back. The stale duplicate was deleted (`id=f6e32164-b0a2-4e11-8d76-1ede523b5170`) so the ledger reads 7 applied rows, then 8 after the deploy.
2. **`preDeployCommand` never ran the second command** — `"npx prisma migrate deploy && npx prisma db seed"` executed only `migrate deploy` (no "Running seed command" in logs, `permissions`/`plans`/`templates` all 0). Routed through `npm run predeploy` so npm's shell owns the chain.
3. **Seed then failed with `ERR_UNKNOWN_FILE_EXTENSION` on `prisma/seed.ts`** — the runner image had no `tsconfig.json`, so ts-node fell back to Node's module syntax detection, which cannot load `.ts` as ESM on Node 20. Reproduced locally with `npx ts-node --skipProject prisma/seed.ts`. Fixed by copying `tsconfig.json` into the runner stage.
4. **The Railway database proxy drops connections intermittently** from this machine (`P1001` on roughly alternating attempts) — the audit script now retries transient errors (`AUDIT_RETRIES`, default 5).

## 6. Known gaps after B4

- `releases` is empty, so no tenant resolves an active release. B8 requires merchants to re-publish after this deploy, then live publish/rollback/read-path/media evidence. Four tenants currently report `status=published` with no published production release.
- `scripts/seed-super-admin.js` used to rewrite `20260827120000_seed_admin/migration.sql` at runtime with the pre-fix SQL; that block was removed in `9a2b222`, so the corrected migration can no longer be regenerated with the missing `updatedAt`.

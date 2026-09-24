-- Additive: explicit active production release reference per tenant.
-- Rollback of this migration: ALTER TABLE "tenants" DROP COLUMN "activeReleaseId";

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "activeReleaseId" TEXT;

-- Backfill: point each tenant at its latest published production release
UPDATE "tenants" t
SET "activeReleaseId" = r."id"
FROM (
  SELECT DISTINCT ON ("tenantId")
    "id", "tenantId"
  FROM "releases"
  WHERE "status" = 'published' AND "channel" = 'production'
  ORDER BY "tenantId", "publishedAt" DESC, "buildNumber" DESC
) r
WHERE t."id" = r."tenantId"
  AND t."activeReleaseId" IS NULL;

-- CreateIndex (optional lookup helper; non-unique to allow nulls freely)
CREATE INDEX "tenants_activeReleaseId_idx" ON "tenants"("activeReleaseId");

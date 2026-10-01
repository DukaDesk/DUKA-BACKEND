-- Two-stage merchant approval: separate verification + app-review state from legacy TenantStatus lifecycle.
-- Stage-1: verificationStatus pending|verified|rejected. Stage-2: appStatus none|in_review|approved|rejected.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "appStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "appReviewedAt" TIMESTAMP(3);

-- CreateTable: kyc_submissions for stage-1 compliance document review
CREATE TABLE "kyc_submissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessName" TEXT,
    "regNo" TEXT,
    "taxId" TEXT,
    "documents" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kyc_submissions_tenantId_idx" ON "kyc_submissions"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kyc_submissions_status_idx" ON "kyc_submissions"("status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterType: Add 'rejected' to TenantStatus enum
DO $$ BEGIN
  ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'rejected';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

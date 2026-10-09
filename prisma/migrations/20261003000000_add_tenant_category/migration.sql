-- Add category flag to tenants (desk category presets dashboard tools)
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "category" TEXT;

-- Add buyer-education spec fields to products (short description, weight, dimensions)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shortDescription" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight" DECIMAL(65,30);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weightUnit" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "length" DECIMAL(65,30);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "width" DECIMAL(65,30);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "height" DECIMAL(65,30);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "dimensionUnit" TEXT;

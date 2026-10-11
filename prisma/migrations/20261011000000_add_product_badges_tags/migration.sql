-- Add flash-sale badge and tags to products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "badge" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}';

-- Promo feed: merchant posts (media + caption + optional product CTA)
-- and a per-actor like ledger (anonymous to merchants, user-linked for
-- future saved/wishlist surfaces).
CREATE TABLE IF NOT EXISTS "feed_posts" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "caption" TEXT,
  "product_id" TEXT,
  "cta_label" TEXT NOT NULL DEFAULT 'Buy Now',
  "media" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'published',
  "like_count" INTEGER NOT NULL DEFAULT 0,
  "share_count" INTEGER NOT NULL DEFAULT 0,
  "patronage_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "feed_posts_tenant_id_created_at_idx" ON "feed_posts"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "feed_posts_status_created_at_idx" ON "feed_posts"("status", "created_at");
CREATE TABLE IF NOT EXISTS "feed_likes" (
  "id" TEXT PRIMARY KEY,
  "post_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "feed_likes_post_id_actor_id_key" ON "feed_likes"("post_id", "actor_id");
CREATE INDEX IF NOT EXISTS "feed_likes_actor_id_idx" ON "feed_likes"("actor_id");

ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feed_likes" ADD CONSTRAINT "feed_likes_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_likes" ADD CONSTRAINT "feed_likes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

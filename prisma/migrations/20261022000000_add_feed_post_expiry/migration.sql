-- Promo posts live for ~24 hours and are then purged from the database.
-- expires_at is optional: rows written before this migration are backfilled
-- from their created_at + 24h. The purge job deletes where expires_at < now().
ALTER TABLE "feed_posts" ADD COLUMN "expires_at" TIMESTAMP(3);

UPDATE "feed_posts"
SET "expires_at" = "created_at" + INTERVAL '24 hours'
WHERE "expires_at" IS NULL;

CREATE INDEX IF NOT EXISTS "feed_posts_expires_at_idx" ON "feed_posts"("expires_at");

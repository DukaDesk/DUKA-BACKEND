-- Platform comms: broadcasts (merchants / mobile / both, media mobile-only)
-- and direct messages to one merchant tenant or one mobile user.
CREATE TABLE IF NOT EXISTS "announcements" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL DEFAULT 'broadcast',
  "audience" TEXT,
  "tenant_id" TEXT,
  "recipient_user_id" TEXT,
  "recipient_actor_id" TEXT,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "media" JSONB,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "announcements_kind_created_at_idx" ON "announcements"("kind", "created_at");
CREATE INDEX IF NOT EXISTS "announcements_audience_created_at_idx" ON "announcements"("audience", "created_at");
CREATE INDEX IF NOT EXISTS "announcements_tenant_id_idx" ON "announcements"("tenant_id");
CREATE INDEX IF NOT EXISTS "announcements_recipient_actor_id_idx" ON "announcements"("recipient_actor_id");

CREATE TABLE IF NOT EXISTS "announcement_replies" (
  "id" TEXT PRIMARY KEY,
  "announcement_id" TEXT NOT NULL,
  "author" TEXT NOT NULL DEFAULT 'merchant',
  "tenant_id" TEXT,
  "body" TEXT NOT NULL,
  "media" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "announcement_replies_announcement_id_created_at_idx"
  ON "announcement_replies"("announcement_id", "created_at");

CREATE TABLE IF NOT EXISTS "announcement_reads" (
  "id" TEXT PRIMARY KEY,
  "announcement_id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "actor_id" TEXT,
  "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "announcement_reads_announcement_id_idx" ON "announcement_reads"("announcement_id");
CREATE INDEX IF NOT EXISTS "announcement_reads_tenant_id_idx" ON "announcement_reads"("tenant_id");
CREATE INDEX IF NOT EXISTS "announcement_reads_actor_id_idx" ON "announcement_reads"("actor_id");

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_replies" ADD CONSTRAINT "announcement_replies_announcement_id_fkey"
  FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_replies" ADD CONSTRAINT "announcement_replies_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey"
  FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

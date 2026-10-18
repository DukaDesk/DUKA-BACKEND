-- Platform support tickets (case/task workflow) + governed platform policies.

CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "category" TEXT NOT NULL DEFAULT 'general',
    "tenantId" TEXT,
    "reportedBy" TEXT,
    "assigneeId" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");
CREATE INDEX "support_tickets_assigneeId_idx" ON "support_tickets"("assigneeId");
CREATE INDEX "support_tickets_tenantId_idx" ON "support_tickets"("tenantId");
CREATE INDEX "support_tickets_priority_idx" ON "support_tickets"("priority");

CREATE TABLE "support_ticket_events" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_ticket_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_ticket_events_ticketId_idx" ON "support_ticket_events"("ticketId");

ALTER TABLE "support_ticket_events"
    ADD CONSTRAINT "support_ticket_events_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "platform_policies" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_policies_key_key" ON "platform_policies"("key");
CREATE INDEX "platform_policies_status_idx" ON "platform_policies"("status");
CREATE INDEX "platform_policies_category_idx" ON "platform_policies"("category");

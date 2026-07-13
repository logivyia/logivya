-- Additive, data-preserving Support Center migration.
ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "publicId" TEXT,
  ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastUserMessageAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastAdminMessageAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstAdminReplyAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "userLastReadAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "adminLastReadAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "userUnreadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "adminUnreadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

ALTER TABLE "SupportTicketMessage"
  ADD COLUMN IF NOT EXISTS "clientMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "SupportTicket"
SET "publicId" = CONCAT(
  'LOG-',
  EXTRACT(YEAR FROM "createdAt")::int,
  '-',
  UPPER(SUBSTRING(MD5("id") FROM 1 FOR 20))
)
WHERE "publicId" IS NULL OR TRIM("publicId") = '';

WITH message_times AS (
  SELECT
    "ticketId",
    MAX("createdAt") AS last_message_at,
    MAX("createdAt") FILTER (WHERE "senderType" IN ('USER', 'CUSTOMER')) AS last_user_message_at,
    MAX("createdAt") FILTER (WHERE "senderType" = 'ADMIN' AND "isInternal" = false) AS last_admin_message_at,
    MIN("createdAt") FILTER (WHERE "senderType" = 'ADMIN' AND "isInternal" = false) AS first_admin_reply_at,
    COUNT(*) FILTER (WHERE "senderType" IN ('USER', 'CUSTOMER') AND "isInternal" = false)::int AS admin_unread_count,
    COUNT(*) FILTER (WHERE "senderType" = 'ADMIN' AND "isInternal" = false)::int AS user_unread_count
  FROM "SupportTicketMessage"
  GROUP BY "ticketId"
)
UPDATE "SupportTicket" AS ticket
SET
  "lastMessageAt" = GREATEST(ticket."lastMessageAt", message_times.last_message_at),
  "lastUserMessageAt" = message_times.last_user_message_at,
  "lastAdminMessageAt" = message_times.last_admin_message_at,
  "firstAdminReplyAt" = message_times.first_admin_reply_at,
  "adminUnreadCount" = message_times.admin_unread_count,
  "userUnreadCount" = message_times.user_unread_count
FROM message_times
WHERE ticket."id" = message_times."ticketId";

UPDATE "SupportTicket" SET "status" = 'WAITING_FOR_ADMIN' WHERE "status" = 'PENDING';
UPDATE "SupportTicket" SET "status" = 'WAITING_FOR_USER' WHERE "status" = 'ANSWERED';
UPDATE "SupportTicket" SET "priority" = 'NORMAL' WHERE "priority" = 'MEDIUM';
UPDATE "SupportTicket" SET "resolvedAt" = COALESCE("resolvedAt", "updatedAt") WHERE "status" = 'RESOLVED';

ALTER TABLE "SupportTicket"
  ALTER COLUMN "publicId" SET NOT NULL,
  ALTER COLUMN "priority" SET DEFAULT 'NORMAL';

CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_publicId_key" ON "SupportTicket"("publicId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_createdById_clientRequestId_key" ON "SupportTicket"("createdById", "clientRequestId");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_lastMessageAt_id_idx" ON "SupportTicket"("status", "lastMessageAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "SupportTicket_createdById_lastMessageAt_id_idx" ON "SupportTicket"("createdById", "lastMessageAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "SupportTicket_assignedToAdminId_status_lastMessageAt_idx" ON "SupportTicket"("assignedToAdminId", "status", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "SupportTicket_priority_status_lastMessageAt_idx" ON "SupportTicket"("priority", "status", "lastMessageAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicketMessage_ticketId_clientMessageId_key" ON "SupportTicketMessage"("ticketId", "clientMessageId");
CREATE INDEX IF NOT EXISTS "SupportTicketMessage_ticketId_createdAt_id_idx" ON "SupportTicketMessage"("ticketId", "createdAt", "id");

CREATE TABLE IF NOT EXISTS "SupportTicketAudit" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "metadata" JSONB,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicketAudit_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportTicketAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SupportTicketAudit_ticketId_createdAt_idx" ON "SupportTicketAudit"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicketAudit_actorUserId_createdAt_idx" ON "SupportTicketAudit"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicketAudit_eventType_createdAt_idx" ON "SupportTicketAudit"("eventType", "createdAt");

INSERT INTO "SupportTicketAudit" ("id", "ticketId", "eventType", "metadata", "createdAt")
SELECT
  CONCAT('support_migration_', MD5(ticket."id" || ':enterprise-support-center')),
  ticket."id",
  'SUPPORT_TICKET_MIGRATED',
  jsonb_build_object('source', ticket."source", 'legacyStatusPreserved', true),
  ticket."createdAt"
FROM "SupportTicket" ticket
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "SupportNotificationOutbox" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "recipientUserId" TEXT,
  "notificationId" TEXT,
  "template" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "SupportOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportNotificationOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportNotificationOutbox_eventKey_key" UNIQUE ("eventKey"),
  CONSTRAINT "SupportNotificationOutbox_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportNotificationOutbox_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportNotificationOutbox_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SupportNotificationOutbox_status_availableAt_idx" ON "SupportNotificationOutbox"("status", "availableAt");
CREATE INDEX IF NOT EXISTS "SupportNotificationOutbox_ticketId_createdAt_idx" ON "SupportNotificationOutbox"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportNotificationOutbox_recipientUserId_createdAt_idx" ON "SupportNotificationOutbox"("recipientUserId", "createdAt");

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'pg_trgm extension could not be installed; continuing without trigram indexes';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "SupportTicket_subject_trgm_idx" ON "SupportTicket" USING GIN ("subject" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "SupportTicket_title_trgm_idx" ON "SupportTicket" USING GIN ("title" gin_trgm_ops);
  END IF;
END $$;

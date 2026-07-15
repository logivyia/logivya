-- Data-preserving repair for legacy support tickets whose original description
-- was never copied into the normalized conversation table.
INSERT INTO "SupportTicketMessage" (
  "id",
  "ticketId",
  "senderUserId",
  "senderType",
  "message",
  "isInternal",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('support_backfill_', MD5(ticket."id" || ':initial-message')),
  ticket."id",
  ticket."createdById",
  'USER'::"SupportSenderType",
  ticket."description",
  false,
  ticket."createdAt",
  ticket."createdAt"
FROM "SupportTicket" AS ticket
WHERE TRIM(ticket."description") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "SupportTicketMessage" AS message
    WHERE message."ticketId" = ticket."id"
      AND message."deletedAt" IS NULL
  )
ON CONFLICT ("id") DO NOTHING;

UPDATE "SupportTicket" AS ticket
SET
  "lastMessageAt" = LEAST(ticket."lastMessageAt", ticket."createdAt"),
  "lastUserMessageAt" = COALESCE(ticket."lastUserMessageAt", ticket."createdAt"),
  "adminUnreadCount" = CASE
    WHEN ticket."adminLastReadAt" IS NULL THEN GREATEST(ticket."adminUnreadCount", 1)
    ELSE ticket."adminUnreadCount"
  END
WHERE EXISTS (
  SELECT 1
  FROM "SupportTicketMessage" AS message
  WHERE message."id" = CONCAT('support_backfill_', MD5(ticket."id" || ':initial-message'))
);

INSERT INTO "SupportTicketAudit" (
  "id",
  "ticketId",
  "eventType",
  "metadata",
  "createdAt"
)
SELECT
  CONCAT('support_audit_', MD5(ticket."id" || ':initial-message-backfill')),
  ticket."id",
  'SUPPORT_INITIAL_MESSAGE_BACKFILLED',
  jsonb_build_object('source', '20260715130000_support_delivery_admin_inbox_repair'),
  CURRENT_TIMESTAMP
FROM "SupportTicket" AS ticket
WHERE EXISTS (
  SELECT 1
  FROM "SupportTicketMessage" AS message
  WHERE message."id" = CONCAT('support_backfill_', MD5(ticket."id" || ':initial-message'))
)
ON CONFLICT ("id") DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "SupportTicketMessage_message_trgm_idx"
      ON "SupportTicketMessage" USING GIN ("message" gin_trgm_ops)
      WHERE "deletedAt" IS NULL AND "isInternal" = false;
  END IF;
END $$;

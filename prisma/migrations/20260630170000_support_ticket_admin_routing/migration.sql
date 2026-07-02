ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "tenantId" TEXT,
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT;

UPDATE "SupportTicket"
SET
  "tenantId" = COALESCE("tenantId", "companyId"),
  "userId" = COALESCE("userId", "createdById"),
  "title" = COALESCE("title", "subject"),
  "category" = COALESCE("category", "type");

UPDATE "SupportTicket" AS ticket
SET "description" = COALESCE(ticket."description", first_message."message")
FROM (
  SELECT DISTINCT ON ("ticketId") "ticketId", "message"
  FROM "SupportTicketMessage"
  WHERE "isInternal" = false
  ORDER BY "ticketId", "createdAt" ASC
) AS first_message
WHERE ticket."id" = first_message."ticketId";

UPDATE "SupportTicket"
SET "description" = COALESCE("description", '');

ALTER TABLE "SupportTicket"
  ALTER COLUMN "tenantId" SET NOT NULL,
  ALTER COLUMN "userId" SET NOT NULL,
  ALTER COLUMN "title" SET NOT NULL,
  ALTER COLUMN "description" SET NOT NULL,
  ALTER COLUMN "category" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_createdAt_idx"
  ON "SupportTicket"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_status_createdAt_idx"
  ON "SupportTicket"("tenantId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportTicket_userId_createdAt_idx"
  ON "SupportTicket"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportTicket_category_createdAt_idx"
  ON "SupportTicket"("category", "createdAt");

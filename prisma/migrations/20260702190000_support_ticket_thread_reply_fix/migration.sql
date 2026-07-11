-- Support ticket thread/reply hardening.
-- Data-safe migration: no rows are deleted or rewritten except filling the new
-- required updatedAt column on existing message rows with the current timestamp.

ALTER TYPE "SupportTicketStatus" ADD VALUE IF NOT EXISTS 'ANSWERED';
ALTER TYPE "SupportSenderType" ADD VALUE IF NOT EXISTS 'USER';

ALTER TABLE "SupportTicketMessage"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

UPDATE "SupportTicketMessage"
SET "updatedAt" = COALESCE("createdAt", NOW())
WHERE "updatedAt" IS NULL;

ALTER TABLE "SupportTicketMessage"
  ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SupportTicket_companyId_idx" ON "SupportTicket"("companyId");
CREATE INDEX IF NOT EXISTS "SupportTicket_userId_idx" ON "SupportTicket"("userId");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX IF NOT EXISTS "SupportTicket_category_idx" ON "SupportTicket"("category");
CREATE INDEX IF NOT EXISTS "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicket_lastMessageAt_idx" ON "SupportTicket"("lastMessageAt");
CREATE INDEX IF NOT EXISTS "SupportTicketMessage_senderUserId_createdAt_idx" ON "SupportTicketMessage"("senderUserId", "createdAt");

-- Preserve durable scheduling state in PostgreSQL so Redis queue loss is recoverable.
ALTER TABLE "MessageCampaign"
  ADD COLUMN IF NOT EXISTS "nextRunAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recurringOccurrenceKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "MessageCampaign_recurringOccurrenceKey_key"
  ON "MessageCampaign"("recurringOccurrenceKey");

CREATE INDEX IF NOT EXISTS "MessageCampaign_scheduleType_status_nextRunAt_idx"
  ON "MessageCampaign"("scheduleType", "status", "nextRunAt");

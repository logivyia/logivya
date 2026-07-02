ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'WEB';

CREATE INDEX IF NOT EXISTS "SupportTicket_companyId_createdAt_idx"
  ON "SupportTicket"("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportTicket_createdById_createdAt_idx"
  ON "SupportTicket"("createdById", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportTicket_status_createdAt_idx"
  ON "SupportTicket"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportTicket_type_createdAt_idx"
  ON "SupportTicket"("type", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportTicket_source_createdAt_idx"
  ON "SupportTicket"("source", "createdAt");

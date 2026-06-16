ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "payload" JSONB;

CREATE INDEX IF NOT EXISTS "Notification_companyId_userId_createdAt_idx" ON "Notification"("companyId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_companyId_type_createdAt_idx" ON "Notification"("companyId", "type", "createdAt");

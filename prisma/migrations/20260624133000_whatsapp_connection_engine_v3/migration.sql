-- WhatsApp Connection Engine V3: persistent health and restore telemetry.
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "lastGroupSyncAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "lastConnectionLatencyMs" INTEGER;
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "batteryState" TEXT;
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "healthScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "recoveryLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "sessionRestoredAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "sessionSnapshotAt" TIMESTAMP(3);

ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "snapshotReason" TEXT;
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "restoreCount" INTEGER NOT NULL DEFAULT 0;

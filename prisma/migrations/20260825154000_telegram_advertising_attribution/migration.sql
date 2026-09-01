-- Telegram delivery-time package attribution.
-- This migration is isolated to Telegram delivery records.
ALTER TABLE "TelegramDelivery"
  ADD COLUMN "renderedContent" TEXT,
  ADD COLUMN "attributionApplied" BOOLEAN,
  ADD COLUMN "attributionLocale" TEXT,
  ADD COLUMN "attributionVersion" TEXT,
  ADD COLUMN "effectivePlanCode" TEXT,
  ADD COLUMN "renderedAt" TIMESTAMP(3);

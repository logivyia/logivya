-- Preserve all historical request and legal snapshots. The new fields are
-- nullable so older accepted contracts are not relabelled with current
-- configuration versions.
ALTER TABLE "SubscriptionRequest"
  ADD COLUMN "transferDescriptionEmail" TEXT,
  ADD COLUMN "pricingConfigVersion" TEXT,
  ADD COLUMN "bankConfigVersion" TEXT,
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "immediatePerformanceConsentAt" TIMESTAMP(3);

CREATE INDEX "SubscriptionRequest_transferDescriptionEmail_createdAt_idx"
  ON "SubscriptionRequest"("transferDescriptionEmail", "createdAt");

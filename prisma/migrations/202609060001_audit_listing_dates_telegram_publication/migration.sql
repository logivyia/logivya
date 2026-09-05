-- Unknown loading dates stay unknown; publication is opt-in per owned group.
-- Deploy all ingestion clients together: the candidate unique key changes below.
ALTER TABLE "FreightListing" ALTER COLUMN "loadingDate" DROP NOT NULL;
ALTER TABLE "VehicleListing" ALTER COLUMN "availableFrom" DROP NOT NULL;
ALTER TABLE "TelegramChat" ADD COLUMN "freightPublicationEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "TelegramSourceDeletion" (
 "chatId" TEXT NOT NULL REFERENCES "TelegramChat"(id) ON DELETE CASCADE,
 "sourceMessageId" TEXT NOT NULL,
 "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("chatId", "sourceMessageId")
);
CREATE INDEX "TelegramSourceDeletion_deletedAt_idx" ON "TelegramSourceDeletion"("deletedAt");
-- Telegram message identifiers are scoped to their chat. Keep sources separate.
DROP INDEX "FreightOpportunityCandidate_source_key";
CREATE UNIQUE INDEX "FreightOpportunityCandidate_source_key" ON "FreightOpportunityCandidate"("ownerUserId", "sourcePlatform", "sourceAccountId", "sourceGroupId", "sourceMessageId", "opportunityIndex");

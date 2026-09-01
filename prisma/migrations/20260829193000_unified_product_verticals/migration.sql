-- Additive publication-state and logistics-sector foundation.
-- Existing canonical listings remain GLOBAL/GENERAL_LOGISTICS and are not duplicated.

CREATE TYPE "ProductFeatureStatus" AS ENUM ('INTERNAL', 'BETA', 'PUBLIC', 'COMING_SOON', 'DISABLED');
CREATE TYPE "MarketplaceScope" AS ENUM ('GLOBAL', 'HOME_MOVING', 'PARTIAL_LOAD', 'HEAVY_HAUL');
CREATE TYPE "LogisticsSectorClassification" AS ENUM ('GENERAL_LOGISTICS', 'HOME_MOVING', 'PARTIAL_LOAD', 'HEAVY_HAUL', 'MULTI_SECTOR', 'UNKNOWN', 'NON_LOGISTICS');
CREATE TYPE "LogisticsSourceGroupHint" AS ENUM ('GENERAL_LOGISTICS', 'HOME_MOVING', 'PARTIAL_LOAD', 'HEAVY_HAUL', 'MIXED', 'UNKNOWN');
CREATE TYPE "FacebookPublicationJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELED');
ALTER TYPE "FreightListingStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- Sector forms such as home moving and partial loads can use a valid quantity
-- representation other than tonnage. Existing values remain unchanged.
ALTER TABLE "FreightListing" ALTER COLUMN "weight" DROP NOT NULL;

ALTER TABLE "MediaFile"
  ADD COLUMN "purpose" VARCHAR(80),
  ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "MediaFile_purpose_expiresAt_idx" ON "MediaFile"("purpose", "expiresAt");

ALTER TABLE "WhatsAppGroup"
  ADD COLUMN "sectorHint" "LogisticsSourceGroupHint" NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "WhatsAppListingExtraction"
  ADD COLUMN "sectorClassification" "LogisticsSectorClassification" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "marketplaceScopes" "MarketplaceScope"[] NOT NULL DEFAULT ARRAY['GLOBAL']::"MarketplaceScope"[],
  ADD COLUMN "sectorConfidenceScore" INTEGER,
  ADD COLUMN "sectorEvidence" JSONB;

ALTER TABLE "FreightListing"
  ADD COLUMN "primarySector" "LogisticsSectorClassification" NOT NULL DEFAULT 'GENERAL_LOGISTICS',
  ADD COLUMN "marketplaceScopes" "MarketplaceScope"[] NOT NULL DEFAULT ARRAY['GLOBAL']::"MarketplaceScope"[],
  ADD COLUMN "sectorDetails" JSONB,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "VehicleListing"
  ADD COLUMN "primarySector" "LogisticsSectorClassification" NOT NULL DEFAULT 'GENERAL_LOGISTICS',
  ADD COLUMN "marketplaceScopes" "MarketplaceScope"[] NOT NULL DEFAULT ARRAY['GLOBAL']::"MarketplaceScope"[],
  ADD COLUMN "sectorDetails" JSONB,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "DriverListing"
  ADD COLUMN "primarySector" "LogisticsSectorClassification" NOT NULL DEFAULT 'GENERAL_LOGISTICS',
  ADD COLUMN "marketplaceScopes" "MarketplaceScope"[] NOT NULL DEFAULT ARRAY['GLOBAL']::"MarketplaceScope"[],
  ADD COLUMN "sectorDetails" JSONB,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "MarketplaceDemandRequest"
  ADD COLUMN "primarySector" "LogisticsSectorClassification" NOT NULL DEFAULT 'GENERAL_LOGISTICS',
  ADD COLUMN "marketplaceScopes" "MarketplaceScope"[] NOT NULL DEFAULT ARRAY['GLOBAL']::"MarketplaceScope"[],
  ADD COLUMN "sectorCriteria" JSONB;

ALTER TABLE "FreightOpportunityCandidate"
  ADD COLUMN "primarySector" "LogisticsSectorClassification" NOT NULL DEFAULT 'GENERAL_LOGISTICS',
  ADD COLUMN "marketplaceScopes" "MarketplaceScope"[] NOT NULL DEFAULT ARRAY['GLOBAL']::"MarketplaceScope"[],
  ADD COLUMN "sectorConfidenceScore" INTEGER,
  ADD COLUMN "sectorEvidence" JSONB;

CREATE TABLE "ProductFeaturePublication" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "status" "ProductFeatureStatus" NOT NULL,
  "platformStatus" JSONB,
  "providerBlocked" BOOLEAN NOT NULL DEFAULT false,
  "blockerCode" TEXT,
  "note" TEXT,
  "updatedById" TEXT,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductFeaturePublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductFeaturePublication_key_key" ON "ProductFeaturePublication"("key");
CREATE INDEX "ProductFeaturePublication_status_effectiveAt_idx" ON "ProductFeaturePublication"("status", "effectiveAt");
CREATE INDEX "ProductFeaturePublication_providerBlocked_idx" ON "ProductFeaturePublication"("providerBlocked");
CREATE INDEX "FreightListing_primarySector_status_createdAt_idx" ON "FreightListing"("primarySector", "status", "createdAt");
CREATE INDEX "FreightListing_expiresAt_status_idx" ON "FreightListing"("expiresAt", "status");
CREATE INDEX "VehicleListing_primarySector_status_createdAt_idx" ON "VehicleListing"("primarySector", "status", "createdAt");
CREATE INDEX "VehicleListing_expiresAt_status_idx" ON "VehicleListing"("expiresAt", "status");
CREATE INDEX "DriverListing_primarySector_status_createdAt_idx" ON "DriverListing"("primarySector", "status", "createdAt");
CREATE INDEX "DriverListing_expiresAt_status_idx" ON "DriverListing"("expiresAt", "status");
CREATE INDEX "MarketplaceDemandRequest_primarySector_status_expiresAt_idx" ON "MarketplaceDemandRequest"("primarySector", "status", "expiresAt");
CREATE INDEX "FreightOpportunityCandidate_sector_expiry_idx" ON "FreightOpportunityCandidate"("primarySector", "expiresAt");

CREATE TABLE "FacebookPublicationJob" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channelAccountId" TEXT NOT NULL,
  "channelMessageId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "FacebookPublicationJobStatus" NOT NULL DEFAULT 'QUEUED',
  "payload" JSONB NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacebookPublicationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacebookPublicationJob_channelMessageId_key" ON "FacebookPublicationJob"("channelMessageId");
CREATE UNIQUE INDEX "FacebookPublicationJob_idempotencyKey_key" ON "FacebookPublicationJob"("idempotencyKey");
CREATE INDEX "FacebookPublicationJob_status_nextAttemptAt_createdAt_idx" ON "FacebookPublicationJob"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "FacebookPublicationJob_lockedBy_lockedAt_idx" ON "FacebookPublicationJob"("lockedBy", "lockedAt");
CREATE INDEX "FacebookPublicationJob_companyId_createdAt_idx" ON "FacebookPublicationJob"("companyId", "createdAt");
CREATE INDEX "FacebookPublicationJob_channelAccountId_status_idx" ON "FacebookPublicationJob"("channelAccountId", "status");

CREATE TABLE "FacebookOAuthTransaction" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'FACEBOOK_PAGES_CONNECT',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacebookOAuthTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacebookOAuthTransaction_stateHash_key" ON "FacebookOAuthTransaction"("stateHash");
CREATE INDEX "FacebookOAuthTransaction_companyId_userId_createdAt_idx" ON "FacebookOAuthTransaction"("companyId", "userId", "createdAt");
CREATE INDEX "FacebookOAuthTransaction_expiresAt_consumedAt_idx" ON "FacebookOAuthTransaction"("expiresAt", "consumedAt");

UPDATE "Plan" SET
  "name" = 'Logivya 7 Gün Ücretsiz',
  "description" = 'Logivya''nın iletişim ve lojistik özelliklerini 7 gün boyunca ücretsiz deneyin.'
WHERE "slug" = 'trial';
UPDATE "Plan" SET
  "name" = 'Logivya Plus',
  "description" = 'Canlı lojistik pazarı, ilan, eşleştirme ve iletişim operasyonları için 2 kullanıcıya kadar erişim.'
WHERE "slug" = 'starter';
UPDATE "Plan" SET
  "name" = 'Logivya Pro',
  "description" = 'Gelişmiş lojistik, eşleştirme ve iletişim operasyonları için 3 kullanıcıya kadar erişim.'
WHERE "slug" = 'professional';

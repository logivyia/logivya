-- Privacy-first, additive Smart Matching Engine. Existing marketplace,
-- WhatsApp delivery and Telegram delivery tables remain unchanged.

CREATE TYPE "SmartMatchSource" AS ENUM ('LOGIVYA', 'WHATSAPP', 'TELEGRAM');
CREATE TYPE "SmartMatchingJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "FreightCandidateIntent" AS ENUM ('OFFER', 'NEED');
CREATE TYPE "SmartMatchResultStatus" AS ENUM ('NEW', 'VIEWED', 'SAVED', 'DISMISSED', 'EXPIRED');

CREATE TABLE "SmartMatchingJob" (
  "id" TEXT NOT NULL,
  "demandId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "triggerKey" TEXT NOT NULL,
  "status" "SmartMatchingJobStatus" NOT NULL DEFAULT 'QUEUED',
  "requestedSources" "SmartMatchSource"[] NOT NULL DEFAULT ARRAY['LOGIVYA', 'WHATSAPP', 'TELEGRAM']::"SmartMatchSource"[],
  "completedSources" "SmartMatchSource"[] NOT NULL DEFAULT ARRAY[]::"SmartMatchSource"[],
  "groupsProcessed" INTEGER NOT NULL DEFAULT 0,
  "messagesAnalyzed" INTEGER NOT NULL DEFAULT 0,
  "candidatesDetected" INTEGER NOT NULL DEFAULT 0,
  "matchesFound" INTEGER NOT NULL DEFAULT 0,
  "duplicatesRemoved" INTEGER NOT NULL DEFAULT 0,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorSummary" JSONB,
  "notificationEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmartMatchingJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FreightOpportunityCandidate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "sourcePlatform" "SmartMatchSource" NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "sourceGroupId" TEXT NOT NULL,
  "sourceGroupName" TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,
  "opportunityIndex" INTEGER NOT NULL DEFAULT 0,
  "candidateType" "MarketplaceRequestKind" NOT NULL,
  "intent" "FreightCandidateIntent" NOT NULL DEFAULT 'OFFER',
  "origin" TEXT,
  "originNormalized" TEXT,
  "originCountry" TEXT,
  "originLocationType" TEXT,
  "destination" TEXT,
  "destinationNormalized" TEXT,
  "destinationCountry" TEXT,
  "destinationLocationType" TEXT,
  "loadingDate" DATE,
  "cargoType" TEXT,
  "weight" DECIMAL(10, 2),
  "weightUnit" "FreightWeightUnit",
  "trailerType" "FreightTrailerType",
  "vehicleCount" INTEGER,
  "priceAmount" DECIMAL(14, 2),
  "currency" VARCHAR(3),
  "customsInformation" TEXT,
  "companyName" TEXT,
  "advertisedBusinessContactEncrypted" TEXT,
  "sourceTextEncrypted" TEXT,
  "sourceTextHash" TEXT NOT NULL,
  "searchText" TEXT NOT NULL,
  "extractionConfidence" INTEGER NOT NULL,
  "duplicateKey" TEXT NOT NULL,
  "sourceMessageTimestamp" TIMESTAMP(3) NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "rawTextExpiresAt" TIMESTAMP(3) NOT NULL,
  "matchingProcessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FreightOpportunityCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmartMatchResult" (
  "id" TEXT NOT NULL,
  "demandId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "sourcePlatform" "SmartMatchSource" NOT NULL,
  "score" INTEGER NOT NULL,
  "status" "SmartMatchResultStatus" NOT NULL DEFAULT 'NEW',
  "originScore" INTEGER NOT NULL,
  "destinationScore" INTEGER NOT NULL,
  "vehicleScore" INTEGER NOT NULL,
  "weightScore" INTEGER NOT NULL,
  "dateScore" INTEGER NOT NULL,
  "freshnessScore" INTEGER NOT NULL,
  "explanation" JSONB NOT NULL,
  "duplicateGroupKey" TEXT NOT NULL,
  "sourceCount" INTEGER NOT NULL DEFAULT 1,
  "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "savedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmartMatchResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SmartMatchingJob_demandId_triggerKey_key" ON "SmartMatchingJob"("demandId", "triggerKey");
CREATE INDEX "SmartMatchingJob_status_nextAttemptAt_createdAt_idx" ON "SmartMatchingJob"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "SmartMatchingJob_ownerUserId_status_createdAt_idx" ON "SmartMatchingJob"("ownerUserId", "status", "createdAt");
CREATE INDEX "SmartMatchingJob_companyId_status_createdAt_idx" ON "SmartMatchingJob"("companyId", "status", "createdAt");

CREATE UNIQUE INDEX "FreightOpportunityCandidate_source_key" ON "FreightOpportunityCandidate"("ownerUserId", "sourcePlatform", "sourceAccountId", "sourceMessageId", "opportunityIndex");
CREATE INDEX "FreightOpportunityCandidate_owner_source_kind_expiry_idx" ON "FreightOpportunityCandidate"("ownerUserId", "sourcePlatform", "candidateType", "expiresAt");
CREATE INDEX "FreightOpportunityCandidate_company_kind_expiry_idx" ON "FreightOpportunityCandidate"("companyId", "candidateType", "expiresAt");
CREATE INDEX "FreightOpportunityCandidate_processing_expiry_created_idx" ON "FreightOpportunityCandidate"("matchingProcessedAt", "expiresAt", "createdAt");
CREATE INDEX "FreightOpportunityCandidate_duplicate_timestamp_idx" ON "FreightOpportunityCandidate"("duplicateKey", "sourceMessageTimestamp");
CREATE INDEX "FreightOpportunityCandidate_route_idx" ON "FreightOpportunityCandidate"("originNormalized", "destinationNormalized");

CREATE UNIQUE INDEX "SmartMatchResult_demandId_candidateId_key" ON "SmartMatchResult"("demandId", "candidateId");
CREATE INDEX "SmartMatchResult_demand_status_score_matched_idx" ON "SmartMatchResult"("demandId", "status", "score", "matchedAt");
CREATE INDEX "SmartMatchResult_owner_status_matched_idx" ON "SmartMatchResult"("ownerUserId", "status", "matchedAt");
CREATE INDEX "SmartMatchResult_duplicate_demand_idx" ON "SmartMatchResult"("duplicateGroupKey", "demandId");
CREATE INDEX "SmartMatchResult_notified_created_idx" ON "SmartMatchResult"("notifiedAt", "createdAt");

ALTER TABLE "SmartMatchingJob" ADD CONSTRAINT "SmartMatchingJob_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "MarketplaceDemandRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmartMatchingJob" ADD CONSTRAINT "SmartMatchingJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmartMatchingJob" ADD CONSTRAINT "SmartMatchingJob_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FreightOpportunityCandidate" ADD CONSTRAINT "FreightOpportunityCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FreightOpportunityCandidate" ADD CONSTRAINT "FreightOpportunityCandidate_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SmartMatchResult" ADD CONSTRAINT "SmartMatchResult_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "MarketplaceDemandRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmartMatchResult" ADD CONSTRAINT "SmartMatchResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "FreightOpportunityCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmartMatchResult" ADD CONSTRAINT "SmartMatchResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmartMatchResult" ADD CONSTRAINT "SmartMatchResult_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

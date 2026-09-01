-- LOGIVYA WhatsApp live listing engine foundation.
-- Additive only: no existing table, column, constraint, or enum value is removed.

CREATE TYPE "WhatsAppIngestionStage" AS ENUM (
  'WHATSAPP_INBOUND',
  'CONTENT_NORMALIZATION',
  'MEDIA_PROCESSING',
  'AI_CLASSIFICATION',
  'STRUCTURED_EXTRACTION',
  'LOCATION_NORMALIZATION',
  'PHONE_NORMALIZATION',
  'DUPLICATE_DETECTION',
  'LISTING_PUBLICATION',
  'DEMAND_MATCHING',
  'NOTIFICATION_DELIVERY',
  'COMPLETED'
);

CREATE TYPE "WhatsAppIngestionStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PENDING_REVIEW',
  'AUTO_PUBLISHED',
  'MANUALLY_PUBLISHED',
  'REJECTED',
  'DUPLICATE',
  'EXPIRED',
  'DELETED_AT_SOURCE',
  'FAILED'
);

CREATE TYPE "LogisticsListingType" AS ENUM (
  'LOAD',
  'VEHICLE',
  'PARTIAL_LOAD',
  'DRIVER',
  'NON_LOGISTICS',
  'UNKNOWN'
);

CREATE TYPE "WhatsAppInboundAttachmentKind" AS ENUM (
  'IMAGE',
  'VIDEO',
  'DOCUMENT',
  'LOCATION',
  'UNKNOWN'
);

CREATE TYPE "MarketplaceListingSource" AS ENUM (
  'LOGIVYA',
  'WHATSAPP',
  'TELEGRAM'
);

ALTER TABLE "WhatsAppGroup"
  ADD COLUMN "ingestionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ingestionApprovedAt" TIMESTAMP(3),
  ADD COLUMN "ingestionApprovedById" TEXT,
  ADD COLUMN "logisticsGroupRecommended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "logisticsRecommendationConfidence" INTEGER,
  ADD COLUMN "autoPublicationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "manualReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "minimumConfidence" INTEGER NOT NULL DEFAULT 85,
  ADD COLUMN "ingestionPausedAt" TIMESTAMP(3),
  ADD COLUMN "lastInboundMessageAt" TIMESTAMP(3),
  ADD COLUMN "lastPublishedListingAt" TIMESTAMP(3),
  ADD COLUMN "processedMessageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "publishedListingCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedMessageCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "WhatsAppGroup_ingestionEnabled_ingestionPausedAt_isArchived_idx"
  ON "WhatsAppGroup"("ingestionEnabled", "ingestionPausedAt", "isArchived");
CREATE INDEX "WhatsAppGroup_autoPublicationEnabled_manualReviewRequired_idx"
  ON "WhatsAppGroup"("autoPublicationEnabled", "manualReviewRequired");

CREATE TABLE "WhatsAppIngestionControl" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "globallyPaused" BOOLEAN NOT NULL DEFAULT false,
  "emergencyKillSwitch" BOOLEAN NOT NULL DEFAULT false,
  "pauseReason" TEXT,
  "rawRetentionDays" INTEGER NOT NULL DEFAULT 7,
  "mediaRetentionDays" INTEGER NOT NULL DEFAULT 7,
  "staleAlertMinutes" INTEGER NOT NULL DEFAULT 15,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppIngestionControl_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppInboundMessage" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "providerMessageKeyHash" TEXT,
  "senderIdentityHash" TEXT,
  "messageType" TEXT NOT NULL,
  "sourceLanguage" TEXT,
  "rawTextEncrypted" TEXT,
  "normalizedText" TEXT,
  "contentHash" TEXT NOT NULL,
  "status" "WhatsAppIngestionStatus" NOT NULL DEFAULT 'RECEIVED',
  "currentStage" "WhatsAppIngestionStage" NOT NULL DEFAULT 'WHATSAPP_INBOUND',
  "stageVersion" INTEGER NOT NULL DEFAULT 1,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastHeartbeatAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "sourceMessageTimestamp" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "editedAtSource" TIMESTAMP(3),
  "deletedAtSource" TIMESTAMP(3),
  "rawExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppInboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppInboundMessage_accountId_providerMessageId_key"
  ON "WhatsAppInboundMessage"("accountId", "providerMessageId");
CREATE INDEX "WhatsAppInboundMessage_groupId_status_receivedAt_idx"
  ON "WhatsAppInboundMessage"("groupId", "status", "receivedAt");
CREATE INDEX "WhatsAppInboundMessage_status_currentStage_nextAttemptAt_idx"
  ON "WhatsAppInboundMessage"("status", "currentStage", "nextAttemptAt");
CREATE INDEX "WhatsAppInboundMessage_lockedAt_lastHeartbeatAt_idx"
  ON "WhatsAppInboundMessage"("lockedAt", "lastHeartbeatAt");
CREATE INDEX "WhatsAppInboundMessage_contentHash_sourceMessageTimestamp_idx"
  ON "WhatsAppInboundMessage"("contentHash", "sourceMessageTimestamp");
CREATE INDEX "WhatsAppInboundMessage_rawExpiresAt_idx"
  ON "WhatsAppInboundMessage"("rawExpiresAt");

CREATE TABLE "WhatsAppInboundAttachment" (
  "id" TEXT NOT NULL,
  "inboundMessageId" TEXT NOT NULL,
  "providerAttachmentId" TEXT,
  "kind" "WhatsAppInboundAttachmentKind" NOT NULL DEFAULT 'UNKNOWN',
  "mimeType" TEXT,
  "fileName" TEXT,
  "fileSize" INTEGER,
  "contentHash" TEXT,
  "captionEncrypted" TEXT,
  "storageKeyEncrypted" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "processedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppInboundAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppInboundAttachment_inboundMessageId_providerAttachmentId_key"
  ON "WhatsAppInboundAttachment"("inboundMessageId", "providerAttachmentId");
CREATE INDEX "WhatsAppInboundAttachment_contentHash_idx"
  ON "WhatsAppInboundAttachment"("contentHash");
CREATE INDEX "WhatsAppInboundAttachment_expiresAt_idx"
  ON "WhatsAppInboundAttachment"("expiresAt");

CREATE TABLE "WhatsAppListingExtraction" (
  "id" TEXT NOT NULL,
  "inboundMessageId" TEXT NOT NULL,
  "extractionIndex" INTEGER NOT NULL DEFAULT 0,
  "listingType" "LogisticsListingType" NOT NULL,
  "isLogisticsListing" BOOLEAN NOT NULL,
  "sourceLanguage" TEXT,
  "title" TEXT,
  "normalizedDescription" TEXT,
  "originCountry" TEXT,
  "originCity" TEXT,
  "originDistrict" TEXT,
  "originLocationId" TEXT,
  "destinationCountry" TEXT,
  "destinationCity" TEXT,
  "destinationDistrict" TEXT,
  "destinationLocationId" TEXT,
  "routeDescription" TEXT,
  "cargoType" TEXT,
  "tonnageMin" DECIMAL(10,2),
  "tonnageMax" DECIMAL(10,2),
  "vehicleCategory" TEXT,
  "trailerType" "FreightTrailerType",
  "loadingDate" DATE,
  "freightAmount" DECIMAL(14,2),
  "freightCurrency" VARCHAR(3),
  "normalizedPhoneEncrypted" TEXT,
  "contactName" TEXT,
  "companyName" TEXT,
  "confidenceScore" INTEGER NOT NULL,
  "missingCriticalFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "extractedFromText" BOOLEAN NOT NULL DEFAULT true,
  "extractedFromMedia" BOOLEAN NOT NULL DEFAULT false,
  "structuredData" JSONB NOT NULL,
  "semanticFingerprint" TEXT NOT NULL,
  "reviewStatus" "WhatsAppIngestionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "candidateId" TEXT,
  "publishedListingKind" "MarketplaceRequestKind",
  "publishedListingId" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppListingExtraction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppListingExtraction_inboundMessageId_extractionIndex_key"
  ON "WhatsAppListingExtraction"("inboundMessageId", "extractionIndex");
CREATE INDEX "WhatsAppListingExtraction_reviewStatus_createdAt_idx"
  ON "WhatsAppListingExtraction"("reviewStatus", "createdAt");
CREATE INDEX "WhatsAppListingExtraction_semanticFingerprint_createdAt_idx"
  ON "WhatsAppListingExtraction"("semanticFingerprint", "createdAt");
CREATE INDEX "WhatsAppListingExtraction_listingType_reviewStatus_publishedAt_idx"
  ON "WhatsAppListingExtraction"("listingType", "reviewStatus", "publishedAt");
CREATE INDEX "WhatsAppListingExtraction_candidateId_idx"
  ON "WhatsAppListingExtraction"("candidateId");
CREATE INDEX "WhatsAppListingExtraction_publishedListingKind_publishedListingId_idx"
  ON "WhatsAppListingExtraction"("publishedListingKind", "publishedListingId");

CREATE TABLE "WhatsAppIngestionAuditLog" (
  "id" TEXT NOT NULL,
  "inboundMessageId" TEXT,
  "groupId" TEXT,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "stage" "WhatsAppIngestionStage",
  "status" "WhatsAppIngestionStatus",
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppIngestionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppIngestionAuditLog_inboundMessageId_createdAt_idx"
  ON "WhatsAppIngestionAuditLog"("inboundMessageId", "createdAt");
CREATE INDEX "WhatsAppIngestionAuditLog_groupId_createdAt_idx"
  ON "WhatsAppIngestionAuditLog"("groupId", "createdAt");
CREATE INDEX "WhatsAppIngestionAuditLog_action_createdAt_idx"
  ON "WhatsAppIngestionAuditLog"("action", "createdAt");

ALTER TABLE "FreightListing"
  ADD COLUMN "source" "MarketplaceListingSource" NOT NULL DEFAULT 'LOGIVYA',
  ADD COLUMN "sourceExtractionId" TEXT,
  ADD COLUMN "isPartialLoad" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "FreightListing_sourceExtractionId_key"
  ON "FreightListing"("sourceExtractionId");

ALTER TABLE "VehicleListing"
  ADD COLUMN "source" "MarketplaceListingSource" NOT NULL DEFAULT 'LOGIVYA',
  ADD COLUMN "sourceExtractionId" TEXT;
CREATE UNIQUE INDEX "VehicleListing_sourceExtractionId_key"
  ON "VehicleListing"("sourceExtractionId");

ALTER TABLE "DriverListing"
  ADD COLUMN "source" "MarketplaceListingSource" NOT NULL DEFAULT 'LOGIVYA',
  ADD COLUMN "sourceExtractionId" TEXT;
CREATE UNIQUE INDEX "DriverListing_sourceExtractionId_key"
  ON "DriverListing"("sourceExtractionId");

ALTER TABLE "MarketplaceDemandRequest"
  ADD COLUMN "originCountry" TEXT,
  ADD COLUMN "originCity" TEXT,
  ADD COLUMN "originDistrict" TEXT,
  ADD COLUMN "originLocationId" TEXT,
  ADD COLUMN "destinationCountry" TEXT,
  ADD COLUMN "destinationCity" TEXT,
  ADD COLUMN "destinationDistrict" TEXT,
  ADD COLUMN "destinationLocationId" TEXT,
  ADD COLUMN "vehicleCategory" TEXT,
  ADD COLUMN "vehicleBodyLength" DECIMAL(6,2),
  ADD COLUMN "requiredPlateCountry" TEXT,
  ADD COLUMN "transitRoute" TEXT,
  ADD COLUMN "cargoType" TEXT,
  ADD COLUMN "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pausedAt" TIMESTAMP(3);
CREATE INDEX "MarketplaceDemandRequest_originLocationId_destinationLocationId_idx"
  ON "MarketplaceDemandRequest"("originLocationId", "destinationLocationId");

CREATE TABLE "MarketplaceListingRevision" (
  "id" TEXT NOT NULL,
  "listingKind" "MarketplaceRequestKind" NOT NULL,
  "listingId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "sourceExtractionId" TEXT,
  "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceListingRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceListingRevision_listingKind_listingId_revision_key"
  ON "MarketplaceListingRevision"("listingKind", "listingId", "revision");
CREATE INDEX "MarketplaceListingRevision_sourceExtractionId_idx"
  ON "MarketplaceListingRevision"("sourceExtractionId");
CREATE INDEX "MarketplaceListingRevision_listingKind_listingId_createdAt_idx"
  ON "MarketplaceListingRevision"("listingKind", "listingId", "createdAt");

ALTER TABLE "WhatsAppInboundMessage"
  ADD CONSTRAINT "WhatsAppInboundMessage_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "WhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WhatsAppInboundMessage_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppInboundAttachment"
  ADD CONSTRAINT "WhatsAppInboundAttachment_inboundMessageId_fkey"
  FOREIGN KEY ("inboundMessageId") REFERENCES "WhatsAppInboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppListingExtraction"
  ADD CONSTRAINT "WhatsAppListingExtraction_inboundMessageId_fkey"
  FOREIGN KEY ("inboundMessageId") REFERENCES "WhatsAppInboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppIngestionAuditLog"
  ADD CONSTRAINT "WhatsAppIngestionAuditLog_inboundMessageId_fkey"
  FOREIGN KEY ("inboundMessageId") REFERENCES "WhatsAppInboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WhatsAppIngestionAuditLog_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "WhatsAppIngestionControl" (
  "id", "globallyPaused", "emergencyKillSwitch", "createdAt", "updatedAt"
) VALUES ('global', false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

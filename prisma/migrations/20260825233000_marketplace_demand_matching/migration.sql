-- Additive demand matching and notification support for the logistics
-- marketplace. Stable WhatsApp/message delivery tables are intentionally
-- untouched.

ALTER TYPE "NotificationCategory" ADD VALUE IF NOT EXISTS 'MARKETPLACE';

CREATE TYPE "MarketplaceRequestKind" AS ENUM ('LOAD', 'VEHICLE', 'DRIVER');
CREATE TYPE "MarketplaceRequestStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FULFILLED', 'EXPIRED');
CREATE TYPE "MarketplaceMatchStatus" AS ENUM ('NEW', 'VIEWED', 'DISMISSED');

CREATE TABLE "MarketplaceDemandRequest" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "clientRequestId" TEXT,
  "kind" "MarketplaceRequestKind" NOT NULL,
  "title" TEXT NOT NULL,
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "keywordsNormalized" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "origin" TEXT,
  "originNormalized" TEXT,
  "destination" TEXT,
  "destinationNormalized" TEXT,
  "location" TEXT,
  "locationNormalized" TEXT,
  "availableFrom" DATE,
  "availableUntil" DATE,
  "trailerType" "FreightTrailerType",
  "minWeight" DECIMAL(10, 2),
  "maxWeight" DECIMAL(10, 2),
  "driverListingType" "DriverListingType",
  "licenseClasses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "employmentType" "DriverEmploymentType",
  "internationalRequired" BOOLEAN NOT NULL DEFAULT false,
  "adrRequired" BOOLEAN NOT NULL DEFAULT false,
  "status" "MarketplaceRequestStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "matchCount" INTEGER NOT NULL DEFAULT 0,
  "lastMatchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceDemandRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceDemandMatch" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "listingKind" "MarketplaceRequestKind" NOT NULL,
  "listingId" TEXT NOT NULL,
  "listingOwnerUserId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "MarketplaceMatchStatus" NOT NULL DEFAULT 'NEW',
  "notificationEventId" TEXT,
  "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceDemandMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceDemandRequest_ownerUserId_clientRequestId_key" ON "MarketplaceDemandRequest"("ownerUserId", "clientRequestId");
CREATE INDEX "MarketplaceDemandRequest_ownerUserId_status_createdAt_idx" ON "MarketplaceDemandRequest"("ownerUserId", "status", "createdAt");
CREATE INDEX "MarketplaceDemandRequest_companyId_status_createdAt_idx" ON "MarketplaceDemandRequest"("companyId", "status", "createdAt");
CREATE INDEX "MarketplaceDemandRequest_kind_status_expiresAt_idx" ON "MarketplaceDemandRequest"("kind", "status", "expiresAt");
CREATE INDEX "MarketplaceDemandRequest_originNormalized_idx" ON "MarketplaceDemandRequest"("originNormalized");
CREATE INDEX "MarketplaceDemandRequest_destinationNormalized_idx" ON "MarketplaceDemandRequest"("destinationNormalized");
CREATE INDEX "MarketplaceDemandRequest_locationNormalized_idx" ON "MarketplaceDemandRequest"("locationNormalized");

CREATE UNIQUE INDEX "MarketplaceDemandMatch_requestId_listingKind_listingId_key" ON "MarketplaceDemandMatch"("requestId", "listingKind", "listingId");
CREATE INDEX "MarketplaceDemandMatch_requestId_status_matchedAt_idx" ON "MarketplaceDemandMatch"("requestId", "status", "matchedAt");
CREATE INDEX "MarketplaceDemandMatch_listingKind_listingId_idx" ON "MarketplaceDemandMatch"("listingKind", "listingId");
CREATE INDEX "MarketplaceDemandMatch_notificationEventId_idx" ON "MarketplaceDemandMatch"("notificationEventId");
CREATE INDEX "MarketplaceDemandMatch_notifiedAt_createdAt_idx" ON "MarketplaceDemandMatch"("notifiedAt", "createdAt");

ALTER TABLE "MarketplaceDemandRequest" ADD CONSTRAINT "MarketplaceDemandRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceDemandRequest" ADD CONSTRAINT "MarketplaceDemandRequest_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceDemandMatch" ADD CONSTRAINT "MarketplaceDemandMatch_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MarketplaceDemandRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceDemandMatch" ADD CONSTRAINT "MarketplaceDemandMatch_listingOwnerUserId_fkey" FOREIGN KEY ("listingOwnerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

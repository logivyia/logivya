-- Freight Marketplace is an additive, independently gated product module.
-- Existing user, company, WhatsApp, message, subscription, and worker data is untouched.

CREATE TYPE "FreightListingStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'INACTIVE');
CREATE TYPE "FreightTrailerType" AS ENUM (
  'CURTAINSIDER',
  'OPEN_TRAILER',
  'CLOSED_TRAILER',
  'REFRIGERATED',
  'CONTAINER',
  'LOWBED',
  'TRUCK',
  'VAN',
  'OTHER'
);
CREATE TYPE "FreightContainerStatus" AS ENUM ('NONE', 'ONE_WAY', 'RETURN_REQUIRED');
CREATE TYPE "FreightWeightUnit" AS ENUM ('METRIC_TONNE');

CREATE TABLE "FreightListing" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "clientRequestId" TEXT,
  "origin" TEXT NOT NULL,
  "originNormalized" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "destinationNormalized" TEXT NOT NULL,
  "loadingDate" DATE NOT NULL,
  "cargoType" TEXT,
  "weight" DECIMAL(10, 2) NOT NULL,
  "weightUnit" "FreightWeightUnit" NOT NULL DEFAULT 'METRIC_TONNE',
  "trailerType" "FreightTrailerType" NOT NULL,
  "vehicleCount" INTEGER NOT NULL DEFAULT 1,
  "priceAmount" DECIMAL(14, 2),
  "currency" VARCHAR(3),
  "customsInfo" TEXT,
  "containerStatus" "FreightContainerStatus" NOT NULL DEFAULT 'NONE',
  "description" TEXT,
  "contactPhone" TEXT NOT NULL,
  "status" "FreightListingStatus" NOT NULL DEFAULT 'ACTIVE',
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "deactivatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FreightListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FreightListing_ownerUserId_clientRequestId_key"
  ON "FreightListing"("ownerUserId", "clientRequestId");
CREATE INDEX "FreightListing_status_loadingDate_createdAt_idx"
  ON "FreightListing"("status", "loadingDate", "createdAt");
CREATE INDEX "FreightListing_status_trailerType_loadingDate_idx"
  ON "FreightListing"("status", "trailerType", "loadingDate");
CREATE INDEX "FreightListing_ownerUserId_status_createdAt_idx"
  ON "FreightListing"("ownerUserId", "status", "createdAt");
CREATE INDEX "FreightListing_companyId_status_createdAt_idx"
  ON "FreightListing"("companyId", "status", "createdAt");
CREATE INDEX "FreightListing_originNormalized_idx"
  ON "FreightListing"("originNormalized");
CREATE INDEX "FreightListing_destinationNormalized_idx"
  ON "FreightListing"("destinationNormalized");

ALTER TABLE "FreightListing"
  ADD CONSTRAINT "FreightListing_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FreightListing"
  ADD CONSTRAINT "FreightListing_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Public access is explicitly OFF. Internal access still requires an active
-- PlatformAdmin role/permission and the internal flag; neither flag alone is sufficient.
INSERT INTO "FeatureFlag" (
  "id", "key", "name", "description", "isEnabled", "rolloutPercentage", "createdAt", "updatedAt"
) VALUES
  (
    'freight-marketplace-public-flag',
    'freight_marketplace_public',
    'Freight Marketplace - Public',
    'Ordinary production user access. Keep disabled until an explicit rollout decision.',
    false,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'freight-marketplace-internal-flag',
    'freight_marketplace_internal',
    'Freight Marketplace - Internal',
    'Active PlatformAdmin accounts with freight_marketplace_internal_access may test the module.',
    true,
    100,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO NOTHING;

-- Additive logistics marketplace expansion. WhatsApp, messaging and Telegram
-- delivery tables are intentionally untouched.

CREATE TYPE "DriverListingType" AS ENUM ('DRIVER_AVAILABLE', 'DRIVER_WANTED');
CREATE TYPE "DriverEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'DAILY');

CREATE TABLE "VehicleListing" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "clientRequestId" TEXT,
  "origin" TEXT NOT NULL,
  "originNormalized" TEXT NOT NULL,
  "destination" TEXT,
  "destinationNormalized" TEXT,
  "availableFrom" DATE NOT NULL,
  "availableUntil" DATE,
  "trailerType" "FreightTrailerType" NOT NULL,
  "capacityWeight" DECIMAL(10, 2),
  "weightUnit" "FreightWeightUnit" NOT NULL DEFAULT 'METRIC_TONNE',
  "vehicleCount" INTEGER NOT NULL DEFAULT 1,
  "internationalTransport" BOOLEAN NOT NULL DEFAULT false,
  "adrSuitable" BOOLEAN NOT NULL DEFAULT false,
  "priceAmount" DECIMAL(14, 2),
  "currency" VARCHAR(3),
  "description" TEXT,
  "contactPhone" TEXT NOT NULL,
  "status" "FreightListingStatus" NOT NULL DEFAULT 'ACTIVE',
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "deactivatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriverListing" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "clientRequestId" TEXT,
  "listingType" "DriverListingType" NOT NULL,
  "title" TEXT NOT NULL,
  "titleNormalized" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "locationNormalized" TEXT NOT NULL,
  "preferredRoute" TEXT,
  "preferredRouteNormalized" TEXT,
  "availableFrom" DATE NOT NULL,
  "licenseClasses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "experienceYears" INTEGER NOT NULL DEFAULT 0,
  "employmentType" "DriverEmploymentType" NOT NULL,
  "internationalExperience" BOOLEAN NOT NULL DEFAULT false,
  "adrCertificate" BOOLEAN NOT NULL DEFAULT false,
  "srcCertificate" BOOLEAN NOT NULL DEFAULT false,
  "psychotechnicalCertificate" BOOLEAN NOT NULL DEFAULT false,
  "salaryAmount" DECIMAL(14, 2),
  "currency" VARCHAR(3),
  "description" TEXT,
  "contactPhone" TEXT NOT NULL,
  "status" "FreightListingStatus" NOT NULL DEFAULT 'ACTIVE',
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "deactivatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriverListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleListing_ownerUserId_clientRequestId_key" ON "VehicleListing"("ownerUserId", "clientRequestId");
CREATE INDEX "VehicleListing_status_availableFrom_createdAt_idx" ON "VehicleListing"("status", "availableFrom", "createdAt");
CREATE INDEX "VehicleListing_status_trailerType_availableFrom_idx" ON "VehicleListing"("status", "trailerType", "availableFrom");
CREATE INDEX "VehicleListing_ownerUserId_status_createdAt_idx" ON "VehicleListing"("ownerUserId", "status", "createdAt");
CREATE INDEX "VehicleListing_companyId_status_createdAt_idx" ON "VehicleListing"("companyId", "status", "createdAt");
CREATE INDEX "VehicleListing_originNormalized_idx" ON "VehicleListing"("originNormalized");
CREATE INDEX "VehicleListing_destinationNormalized_idx" ON "VehicleListing"("destinationNormalized");

CREATE UNIQUE INDEX "DriverListing_ownerUserId_clientRequestId_key" ON "DriverListing"("ownerUserId", "clientRequestId");
CREATE INDEX "DriverListing_status_listingType_availableFrom_createdAt_idx" ON "DriverListing"("status", "listingType", "availableFrom", "createdAt");
CREATE INDEX "DriverListing_status_employmentType_availableFrom_idx" ON "DriverListing"("status", "employmentType", "availableFrom");
CREATE INDEX "DriverListing_ownerUserId_status_createdAt_idx" ON "DriverListing"("ownerUserId", "status", "createdAt");
CREATE INDEX "DriverListing_companyId_status_createdAt_idx" ON "DriverListing"("companyId", "status", "createdAt");
CREATE INDEX "DriverListing_titleNormalized_idx" ON "DriverListing"("titleNormalized");
CREATE INDEX "DriverListing_locationNormalized_idx" ON "DriverListing"("locationNormalized");
CREATE INDEX "DriverListing_preferredRouteNormalized_idx" ON "DriverListing"("preferredRouteNormalized");

ALTER TABLE "VehicleListing" ADD CONSTRAINT "VehicleListing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleListing" ADD CONSTRAINT "VehicleListing_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverListing" ADD CONSTRAINT "DriverListing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverListing" ADD CONSTRAINT "DriverListing_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

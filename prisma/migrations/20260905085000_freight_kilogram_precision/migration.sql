-- Preserve kilograms in tonne-based fields, keeping the existing integer range.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "FreightListing" ALTER COLUMN "weight" TYPE DECIMAL(12,4);
ALTER TABLE "FreightOpportunityCandidate" ALTER COLUMN "weight" TYPE DECIMAL(12,4);
ALTER TABLE "MarketplaceDemandRequest" ALTER COLUMN "minWeight" TYPE DECIMAL(12,4), ALTER COLUMN "maxWeight" TYPE DECIMAL(12,4);
ALTER TABLE "WhatsAppListingExtraction" ALTER COLUMN "tonnageMin" TYPE DECIMAL(12,4), ALTER COLUMN "tonnageMax" TYPE DECIMAL(12,4);
COMMIT;

-- Contact identity metadata is additive and keeps existing contact/category/message references intact.
CREATE TYPE "ContactDisplayNameSource" AS ENUM ('SAVED_NAME', 'NOTIFY', 'VERIFIED_NAME', 'PUSH_NAME', 'PHONE_FALLBACK');
CREATE TYPE "ContactSyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED');

ALTER TABLE "Contact"
  ADD COLUMN "notifyName" TEXT,
  ADD COLUMN "verifiedName" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "displayNameSource" "ContactDisplayNameSource",
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

UPDATE "Contact"
SET
  "displayName" = COALESCE(NULLIF(BTRIM("name"), ''), NULLIF(BTRIM("pushName"), ''), CONCAT('+', "phone")),
  "displayNameSource" = CASE
    WHEN NULLIF(BTRIM("name"), '') IS NOT NULL THEN 'SAVED_NAME'::"ContactDisplayNameSource"
    WHEN NULLIF(BTRIM("pushName"), '') IS NOT NULL THEN 'PUSH_NAME'::"ContactDisplayNameSource"
    ELSE 'PHONE_FALLBACK'::"ContactDisplayNameSource"
  END,
  "lastSyncedAt" = COALESCE("lastSeenAt", "updatedAt");

CREATE INDEX "Contact_accountId_isActive_displayName_idx" ON "Contact"("accountId", "isActive", "displayName");

CREATE TABLE "ContactSyncRun" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "source" TEXT NOT NULL,
  "status" "ContactSyncStatus" NOT NULL DEFAULT 'QUEUED',
  "discoveredCount" INTEGER NOT NULL DEFAULT 0,
  "persistedCount" INTEGER NOT NULL DEFAULT 0,
  "namedCount" INTEGER NOT NULL DEFAULT 0,
  "fallbackCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactSyncRun_accountId_status_createdAt_idx" ON "ContactSyncRun"("accountId", "status", "createdAt");
CREATE INDEX "ContactSyncRun_companyId_createdAt_idx" ON "ContactSyncRun"("companyId", "createdAt");
CREATE INDEX "ContactSyncRun_requestedByUserId_createdAt_idx" ON "ContactSyncRun"("requestedByUserId", "createdAt");

ALTER TABLE "ContactSyncRun" ADD CONSTRAINT "ContactSyncRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactSyncRun" ADD CONSTRAINT "ContactSyncRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactSyncRun" ADD CONSTRAINT "ContactSyncRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

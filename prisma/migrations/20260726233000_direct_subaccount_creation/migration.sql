-- Direct sub-account creation keeps subscription ownership at company level.
ALTER TABLE "User"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "temporaryPasswordSetAt" TIMESTAMP(3);

ALTER TABLE "CompanyUser"
  ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "CompanyUser_createdByUserId_idx" ON "CompanyUser"("createdByUserId");

ALTER TABLE "CompanyUser"
  ADD CONSTRAINT "CompanyUser_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ForcedPasswordChangeChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "deviceId" TEXT,
  "platform" TEXT,
  "appVersion" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForcedPasswordChangeChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForcedPasswordChangeChallenge_tokenHash_key"
  ON "ForcedPasswordChangeChallenge"("tokenHash");
CREATE INDEX "ForcedPasswordChangeChallenge_userId_usedAt_expiresAt_idx"
  ON "ForcedPasswordChangeChallenge"("userId", "usedAt", "expiresAt");
CREATE INDEX "ForcedPasswordChangeChallenge_companyId_createdAt_idx"
  ON "ForcedPasswordChangeChallenge"("companyId", "createdAt");

ALTER TABLE "ForcedPasswordChangeChallenge"
  ADD CONSTRAINT "ForcedPasswordChangeChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForcedPasswordChangeChallenge"
  ADD CONSTRAINT "ForcedPasswordChangeChallenge_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve invitation history while disabling every unconsumed legacy invite.
UPDATE "CompanyInvitation"
SET
  "status" = 'REVOKED',
  "reservedSeat" = false,
  "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING';

UPDATE "InvitationDeliveryOutbox"
SET
  "status" = 'FAILED',
  "lastError" = 'INVITATION_FLOW_DISABLED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('PENDING', 'PROCESSING');

-- Additive MFA hardening. Existing users and sessions remain valid unless MFA is enabled.
ALTER TABLE "User"
  ADD COLUMN "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaRequiredAt" TIMESTAMP(3);

ALTER TABLE "UserSession"
  ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);

ALTER TABLE "MobileDeviceSession"
  ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);

ALTER TABLE "TrustedDevice"
  ADD COLUMN "tokenHash" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "lastUsedAt" TIMESTAMP(3);

ALTER TABLE "MfaCredential"
  ADD COLUMN "lastUsedCounter" INTEGER;

UPDATE "User" AS u
SET "mfaRequired" = true,
    "mfaRequiredAt" = COALESCE(u."mfaRequiredAt", CURRENT_TIMESTAMP)
WHERE EXISTS (
  SELECT 1 FROM "MfaCredential" AS credential
  WHERE credential."userId" = u."id"
    AND credential."verifiedAt" IS NOT NULL
    AND credential."revokedAt" IS NULL
);

CREATE TABLE "MfaLoginChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'LOGIN',
  "deviceId" TEXT,
  "platform" TEXT,
  "appVersion" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MfaLoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");
CREATE UNIQUE INDEX "MfaLoginChallenge_tokenHash_key" ON "MfaLoginChallenge"("tokenHash");
CREATE INDEX "MfaLoginChallenge_userId_consumedAt_expiresAt_idx" ON "MfaLoginChallenge"("userId", "consumedAt", "expiresAt");
CREATE INDEX "MfaLoginChallenge_companyId_createdAt_idx" ON "MfaLoginChallenge"("companyId", "createdAt");

ALTER TABLE "MfaLoginChallenge"
  ADD CONSTRAINT "MfaLoginChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add a bounded, token-bound lifecycle to pending TOTP enrollment records.
-- Verified credentials and existing sessions remain unchanged.
ALTER TABLE "MfaCredential"
  ADD COLUMN "setupTokenHash" TEXT,
  ADD COLUMN "setupKey" TEXT,
  ADD COLUMN "setupExpiresAt" TIMESTAMP(3),
  ADD COLUMN "setupAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "setupLockedUntil" TIMESTAMP(3),
  ADD COLUMN "recoveryCodesGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Legacy unverified credentials cannot be resumed securely because they have no
-- one-time setup token. Revoke only those incomplete records.
UPDATE "MfaCredential"
SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "verifiedAt" IS NULL
  AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "MfaCredential_setupTokenHash_key"
  ON "MfaCredential"("setupTokenHash");

CREATE UNIQUE INDEX "MfaCredential_setupKey_key"
  ON "MfaCredential"("setupKey");

CREATE INDEX "MfaCredential_userId_verifiedAt_setupExpiresAt_idx"
  ON "MfaCredential"("userId", "verifiedAt", "setupExpiresAt");

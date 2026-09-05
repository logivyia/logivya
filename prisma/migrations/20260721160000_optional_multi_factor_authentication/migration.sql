-- Optional, independently managed MFA methods. Existing accounts keep their
-- current behavior; no organization policy is enabled by this migration.
ALTER TABLE "User" ADD COLUMN "preferredMfaMethod" TEXT;
ALTER TABLE "Company" ADD COLUMN "mfaPolicy" TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE "MfaCredential" ALTER COLUMN "secretEncrypted" DROP NOT NULL;
ALTER TABLE "MfaCredential" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "MfaCredential" ADD COLUMN "enabledAt" TIMESTAMP(3);
ALTER TABLE "MfaCredential" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "MfaCredential" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "MfaCredential" ADD COLUMN "isPreferred" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MfaLoginChallenge" ADD COLUMN "selectedMethod" TEXT;
ALTER TABLE "MfaLoginChallenge" ADD COLUMN "otpCodeHash" TEXT;
ALTER TABLE "MfaLoginChallenge" ADD COLUMN "otpSentAt" TIMESTAMP(3);
ALTER TABLE "MfaLoginChallenge" ADD COLUMN "otpExpiresAt" TIMESTAMP(3);

UPDATE "MfaCredential"
SET
  "status" = CASE
    WHEN "revokedAt" IS NOT NULL THEN 'DISABLED'
    WHEN "verifiedAt" IS NOT NULL THEN 'ENABLED'
    WHEN "setupLockedUntil" IS NOT NULL AND "setupLockedUntil" > NOW() THEN 'LOCKED'
    ELSE 'PENDING'
  END,
  "enabledAt" = "verifiedAt",
  "disabledAt" = "revokedAt";

WITH preferred AS (
  SELECT DISTINCT ON ("userId") "id", "userId", "type"
  FROM "MfaCredential"
  WHERE "status" = 'ENABLED' AND "revokedAt" IS NULL
  ORDER BY "userId", "verifiedAt" DESC NULLS LAST, "createdAt" DESC
)
UPDATE "MfaCredential" AS credential
SET "isPreferred" = true
FROM preferred
WHERE credential."id" = preferred."id";

WITH preferred AS (
  SELECT DISTINCT ON ("userId") "userId", "type"
  FROM "MfaCredential"
  WHERE "status" = 'ENABLED' AND "revokedAt" IS NULL
  ORDER BY "userId", "verifiedAt" DESC NULLS LAST, "createdAt" DESC
)
UPDATE "User" AS account
SET "preferredMfaMethod" = preferred."type"
FROM preferred
WHERE account."id" = preferred."userId";

CREATE UNIQUE INDEX "MfaCredential_one_enabled_method_per_user"
  ON "MfaCredential"("userId", "type")
  WHERE "status" = 'ENABLED' AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "MfaCredential_one_preferred_method_per_user"
  ON "MfaCredential"("userId")
  WHERE "isPreferred" = true AND "status" = 'ENABLED' AND "revokedAt" IS NULL;

CREATE INDEX "MfaCredential_user_status_type_idx"
  ON "MfaCredential"("userId", "status", "type");

CREATE INDEX "MfaLoginChallenge_method_expiry_idx"
  ON "MfaLoginChallenge"("selectedMethod", "otpExpiresAt");

ALTER TABLE "Company" ADD CONSTRAINT "Company_mfaPolicy_check"
  CHECK ("mfaPolicy" IN ('NONE', 'REQUIRE_ANY_MFA', 'REQUIRE_TOTP', 'REQUIRE_TOTP_FOR_ADMINS'));

ALTER TABLE "MfaCredential" ADD CONSTRAINT "MfaCredential_type_check"
  CHECK ("type" IN ('TOTP', 'EMAIL_OTP'));

ALTER TABLE "MfaCredential" ADD CONSTRAINT "MfaCredential_status_check"
  CHECK ("status" IN ('PENDING', 'ENABLED', 'DISABLED', 'LOCKED', 'REQUIRES_REVERIFICATION'));

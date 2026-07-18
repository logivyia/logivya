ALTER TABLE "MobileRefreshTokenHistory"
ADD COLUMN "replacementTokenEncrypted" TEXT,
ADD COLUMN "recoveryExpiresAt" TIMESTAMP(3),
ADD COLUMN "retryAcceptedAt" TIMESTAMP(3),
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;

-- Additive refresh-token history used to detect replay without changing existing sessions.
CREATE TABLE "MobileRefreshTokenHistory" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replayDetectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileRefreshTokenHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileRefreshTokenHistory_tokenHash_key"
ON "MobileRefreshTokenHistory"("tokenHash");

CREATE INDEX "MobileRefreshTokenHistory_sessionId_createdAt_idx"
ON "MobileRefreshTokenHistory"("sessionId", "createdAt");

CREATE INDEX "MobileRefreshTokenHistory_expiresAt_idx"
ON "MobileRefreshTokenHistory"("expiresAt");

ALTER TABLE "MobileRefreshTokenHistory"
ADD CONSTRAINT "MobileRefreshTokenHistory_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "MobileDeviceSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "MobilePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB', 'UNKNOWN');

CREATE TABLE "MobileDeviceSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "platform" "MobilePlatform" NOT NULL DEFAULT 'UNKNOWN',
  "appVersion" TEXT,
  "userAgent" TEXT,
  "refreshTokenHash" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MobileDeviceSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobileDeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobileDeviceSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MobileDeviceSession_refreshTokenHash_key" ON "MobileDeviceSession"("refreshTokenHash");
CREATE INDEX "MobileDeviceSession_userId_revokedAt_expiresAt_idx" ON "MobileDeviceSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX "MobileDeviceSession_companyId_revokedAt_idx" ON "MobileDeviceSession"("companyId", "revokedAt");
CREATE INDEX "MobileDeviceSession_deviceId_idx" ON "MobileDeviceSession"("deviceId");
CREATE INDEX "MobileDeviceSession_refreshTokenHash_idx" ON "MobileDeviceSession"("refreshTokenHash");

CREATE TABLE "MobilePushToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "platform" "MobilePlatform" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "appVersion" TEXT,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MobilePushToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobilePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobilePushToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MobilePushToken_tokenHash_key" ON "MobilePushToken"("tokenHash");
CREATE INDEX "MobilePushToken_userId_revokedAt_idx" ON "MobilePushToken"("userId", "revokedAt");
CREATE INDEX "MobilePushToken_companyId_platform_idx" ON "MobilePushToken"("companyId", "platform");
CREATE INDEX "MobilePushToken_deviceId_idx" ON "MobilePushToken"("deviceId");

CREATE TABLE IF NOT EXISTS "MobileFeedback" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "screenshot" TEXT,
  "deviceInfo" JSONB,
  "appVersion" TEXT,
  "platform" "MobilePlatform" NOT NULL DEFAULT 'UNKNOWN',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MobileFeedback_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MobileFeedback_companyId_fkey'
  ) THEN
    ALTER TABLE "MobileFeedback"
      ADD CONSTRAINT "MobileFeedback_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MobileFeedback_userId_fkey'
  ) THEN
    ALTER TABLE "MobileFeedback"
      ADD CONSTRAINT "MobileFeedback_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MobileFeedback_companyId_createdAt_idx" ON "MobileFeedback"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "MobileFeedback_userId_createdAt_idx" ON "MobileFeedback"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "MobileFeedback_type_status_idx" ON "MobileFeedback"("type", "status");

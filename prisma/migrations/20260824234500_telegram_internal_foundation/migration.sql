-- Additive Telegram internal-test foundation. This migration does not alter
-- WhatsApp account, group, campaign, recipient, session, or delivery tables.

CREATE TYPE "TelegramAccountStatus" AS ENUM ('PENDING_AUTH', 'AUTHENTICATING', 'CONNECTED', 'REAUTHORIZATION_REQUIRED', 'DISCONNECTED', 'ERROR', 'ARCHIVED');
CREATE TYPE "TelegramAccountType" AS ENUM ('USER', 'BOT');
CREATE TYPE "TelegramAuthState" AS ENUM ('STARTING', 'WAIT_PHONE_NUMBER', 'WAIT_EMAIL_ADDRESS', 'WAIT_EMAIL_CODE', 'WAIT_CODE', 'WAIT_PASSWORD', 'WAIT_OTHER_DEVICE', 'READY', 'LOGGING_OUT', 'CLOSED', 'ERROR');
CREATE TYPE "TelegramChatType" AS ENUM ('PRIVATE', 'BASIC_GROUP', 'SUPERGROUP', 'CHANNEL', 'SECRET', 'UNKNOWN');
CREATE TYPE "TelegramDispatchStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELED', 'FAILED');
CREATE TYPE "TelegramRunStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'PARTIAL', 'FAILED', 'CANCELED');
CREATE TYPE "TelegramDeliveryStatus" AS ENUM ('QUEUED', 'PROCESSING', 'FLOOD_WAIT', 'SENT', 'FAILED', 'CANCELED');

CREATE TABLE "TelegramAccount" (
  "id" TEXT NOT NULL,
  "channelAccountId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "accountType" "TelegramAccountType" NOT NULL DEFAULT 'USER',
  "phoneNumberMasked" TEXT,
  "telegramUserId" TEXT,
  "username" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "status" "TelegramAccountStatus" NOT NULL DEFAULT 'PENDING_AUTH',
  "authState" "TelegramAuthState" NOT NULL DEFAULT 'STARTING',
  "authStateDetail" JSONB,
  "databaseKeyEncrypted" TEXT NOT NULL,
  "lastConnectedAt" TIMESTAMP(3),
  "lastDisconnectedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramChat" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "externalChatId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "username" TEXT,
  "type" "TelegramChatType" NOT NULL,
  "participantCount" INTEGER NOT NULL DEFAULT 0,
  "canSend" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "rawPermissions" JSONB,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramCategoryChat" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramCategoryChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramDispatch" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "contentJson" JSONB,
  "scheduleType" "ScheduleType" NOT NULL DEFAULT 'SEND_NOW',
  "scheduledAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  "recurringRule" JSONB,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "status" "TelegramDispatchStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramDispatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramDispatchTarget" (
  "id" TEXT NOT NULL,
  "dispatchId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramDispatchTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramDispatchRun" (
  "id" TEXT NOT NULL,
  "dispatchId" TEXT NOT NULL,
  "occurrenceKey" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "TelegramRunStatus" NOT NULL DEFAULT 'QUEUED',
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "floodWaitCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramDispatchRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramDelivery" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "status" "TelegramDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "externalMessageId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramAccount_channelAccountId_key" ON "TelegramAccount"("channelAccountId");
CREATE UNIQUE INDEX "TelegramAccount_storageKey_key" ON "TelegramAccount"("storageKey");
CREATE UNIQUE INDEX "TelegramAccount_ownerUserId_telegramUserId_key" ON "TelegramAccount"("ownerUserId", "telegramUserId");
CREATE INDEX "TelegramAccount_companyId_ownerUserId_status_idx" ON "TelegramAccount"("companyId", "ownerUserId", "status");
CREATE INDEX "TelegramAccount_ownerUserId_archivedAt_idx" ON "TelegramAccount"("ownerUserId", "archivedAt");
CREATE UNIQUE INDEX "TelegramChat_accountId_externalChatId_key" ON "TelegramChat"("accountId", "externalChatId");
CREATE INDEX "TelegramChat_companyId_accountId_isActive_canSend_idx" ON "TelegramChat"("companyId", "accountId", "isActive", "canSend");
CREATE INDEX "TelegramChat_accountId_type_isActive_isArchived_idx" ON "TelegramChat"("accountId", "type", "isActive", "isArchived");
CREATE UNIQUE INDEX "TelegramCategoryChat_categoryId_chatId_key" ON "TelegramCategoryChat"("categoryId", "chatId");
CREATE INDEX "TelegramCategoryChat_chatId_categoryId_idx" ON "TelegramCategoryChat"("chatId", "categoryId");
CREATE INDEX "TelegramCategoryChat_companyId_categoryId_idx" ON "TelegramCategoryChat"("companyId", "categoryId");
CREATE UNIQUE INDEX "TelegramDispatch_createdById_clientRequestId_key" ON "TelegramDispatch"("createdById", "clientRequestId");
CREATE INDEX "TelegramDispatch_status_nextRunAt_idx" ON "TelegramDispatch"("status", "nextRunAt");
CREATE INDEX "TelegramDispatch_companyId_createdById_createdAt_idx" ON "TelegramDispatch"("companyId", "createdById", "createdAt");
CREATE INDEX "TelegramDispatch_accountId_status_nextRunAt_idx" ON "TelegramDispatch"("accountId", "status", "nextRunAt");
CREATE UNIQUE INDEX "TelegramDispatchTarget_dispatchId_chatId_key" ON "TelegramDispatchTarget"("dispatchId", "chatId");
CREATE INDEX "TelegramDispatchTarget_chatId_dispatchId_idx" ON "TelegramDispatchTarget"("chatId", "dispatchId");
CREATE UNIQUE INDEX "TelegramDispatchRun_dispatchId_occurrenceKey_key" ON "TelegramDispatchRun"("dispatchId", "occurrenceKey");
CREATE INDEX "TelegramDispatchRun_status_scheduledFor_idx" ON "TelegramDispatchRun"("status", "scheduledFor");
CREATE INDEX "TelegramDispatchRun_dispatchId_createdAt_idx" ON "TelegramDispatchRun"("dispatchId", "createdAt");
CREATE UNIQUE INDEX "TelegramDelivery_runId_chatId_key" ON "TelegramDelivery"("runId", "chatId");
CREATE INDEX "TelegramDelivery_status_nextAttemptAt_idx" ON "TelegramDelivery"("status", "nextAttemptAt");
CREATE INDEX "TelegramDelivery_chatId_sentAt_idx" ON "TelegramDelivery"("chatId", "sentAt");
CREATE INDEX "TelegramDelivery_lockedBy_lockedAt_idx" ON "TelegramDelivery"("lockedBy", "lockedAt");

ALTER TABLE "TelegramAccount" ADD CONSTRAINT "TelegramAccount_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAccount" ADD CONSTRAINT "TelegramAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelegramAccount" ADD CONSTRAINT "TelegramAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelegramChat" ADD CONSTRAINT "TelegramChat_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelegramChat" ADD CONSTRAINT "TelegramChat_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TelegramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramCategoryChat" ADD CONSTRAINT "TelegramCategoryChat_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramCategoryChat" ADD CONSTRAINT "TelegramCategoryChat_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TelegramChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramCategoryChat" ADD CONSTRAINT "TelegramCategoryChat_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramDispatch" ADD CONSTRAINT "TelegramDispatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelegramDispatch" ADD CONSTRAINT "TelegramDispatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TelegramAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelegramDispatch" ADD CONSTRAINT "TelegramDispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelegramDispatchTarget" ADD CONSTRAINT "TelegramDispatchTarget_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "TelegramDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramDispatchTarget" ADD CONSTRAINT "TelegramDispatchTarget_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TelegramChat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelegramDispatchRun" ADD CONSTRAINT "TelegramDispatchRun_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "TelegramDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramDelivery" ADD CONSTRAINT "TelegramDelivery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TelegramDispatchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramDelivery" ADD CONSTRAINT "TelegramDelivery_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TelegramChat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "FeatureFlag" ("id", "key", "name", "description", "isEnabled", "rolloutPercentage", "createdAt", "updatedAt")
VALUES
  ('telegram_public_flag', 'telegram_public', 'Telegram public access', 'Must remain disabled until a separately approved public rollout.', false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('telegram_internal_flag', 'telegram_internal', 'Telegram internal access', 'Backend-gated internal Android tester access.', true, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isEnabled" = EXCLUDED."isEnabled",
  "rolloutPercentage" = EXCLUDED."rolloutPercentage",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AdminPermission" ("id", "code", "description", "createdAt")
VALUES ('telegram_internal_access_permission', 'telegram_internal_access', 'Use the internal Telegram integration.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "PlatformAdmin" AS pa
SET "permissions" = array_append(pa."permissions", 'telegram_internal_access'),
    "updatedAt" = CURRENT_TIMESTAMP
FROM "User" AS u
WHERE pa."userId" = u."id"
  AND lower(u."email") = 'burakidim@gmail.com'
  AND pa."isActive" = true
  AND NOT ('telegram_internal_access' = ANY(pa."permissions"));

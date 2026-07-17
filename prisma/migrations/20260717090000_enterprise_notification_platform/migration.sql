-- Enterprise notification platform. This migration is additive and preserves legacy notification rows.
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'ANDROID_PUSH', 'IOS_PUSH', 'WEB_PUSH', 'SMS_FUTURE');
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
CREATE TYPE "NotificationCategory" AS ENUM ('ACCOUNT', 'SECURITY', 'SUPPORT', 'SUBSCRIPTION', 'BILLING', 'INVITATION', 'WHATSAPP', 'MESSAGE', 'SYSTEM', 'MARKETING', 'COMPLIANCE', 'ADMINISTRATION', 'BACKUP', 'INCIDENT');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'SENT', 'ACCEPTED', 'DELIVERED', 'FAILED', 'BOUNCED', 'REJECTED', 'EXPIRED', 'CANCELED', 'DEAD_LETTERED');
CREATE TYPE "NotificationAudience" AS ENUM ('USER', 'COMPANY', 'COMPANY_OWNERS', 'COMPANY_USERS', 'PLATFORM_ADMIN', 'PLATFORM_ALL_USERS', 'CUSTOM_SEGMENT');

CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "companyId" TEXT,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "audience" "NotificationAudience" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "payload" JSONB NOT NULL,
    "correlationId" TEXT,
    "collapseKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification"
    ADD COLUMN "eventId" TEXT,
    ADD COLUMN "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    ADD COLUMN "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN "audience" "NotificationAudience" NOT NULL DEFAULT 'USER',
    ADD COLUMN "deepLink" TEXT,
    ADD COLUMN "collapseKey" TEXT,
    ADD COLUMN "collapsedCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastCollapsedAt" TIMESTAMP(3),
    ADD COLUMN "readAt" TIMESTAMP(3),
    ADD COLUMN "archivedAt" TIMESTAMP(3),
    ADD COLUMN "expiresAt" TIMESTAMP(3),
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mandatoryLocked" BOOLEAN NOT NULL DEFAULT false,
    "digestMode" TEXT NOT NULL DEFAULT 'IMMEDIATE',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationAudienceExpansion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "audience" "NotificationAudience" NOT NULL,
    "companyId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "cursorId" TEXT,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 10,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastErrorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationAudienceExpansion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL',
    "eventType" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "requiredVariables" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'tr',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "recipientHash" TEXT,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "providerMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mobilePushTokenId" TEXT NOT NULL,
    "platform" "MobilePlatform" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'tr',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "NotificationAudience" NOT NULL DEFAULT 'PLATFORM_ALL_USERS',
    "companyId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'tr',
    "channels" "NotificationChannel"[] NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "deepLink" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalState" TEXT NOT NULL DEFAULT 'PENDING',
    "previewHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDeadLetter" (
    "id" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "reason" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,
    "deadLetteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDeadLetter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationProviderWebhook" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "NotificationStatus",
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationProviderWebhook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationEvent_eventKey_key" ON "NotificationEvent"("eventKey");
CREATE UNIQUE INDEX "NotificationEvent_idempotencyKey_key" ON "NotificationEvent"("idempotencyKey");
CREATE INDEX "NotificationEvent_companyId_occurredAt_idx" ON "NotificationEvent"("companyId", "occurredAt");
CREATE INDEX "NotificationEvent_type_occurredAt_idx" ON "NotificationEvent"("type", "occurredAt");
CREATE INDEX "NotificationEvent_category_occurredAt_idx" ON "NotificationEvent"("category", "occurredAt");
CREATE INDEX "NotificationEvent_correlationId_idx" ON "NotificationEvent"("correlationId");
CREATE INDEX "NotificationEvent_companyId_type_collapseKey_occurredAt_idx" ON "NotificationEvent"("companyId", "type", "collapseKey", "occurredAt");
CREATE INDEX "Notification_eventId_idx" ON "Notification"("eventId");
CREATE INDEX "Notification_companyId_userId_archivedAt_createdAt_idx" ON "Notification"("companyId", "userId", "archivedAt", "createdAt");
CREATE INDEX "Notification_category_createdAt_idx" ON "Notification"("category", "createdAt");
CREATE INDEX "Notification_companyId_userId_collapseKey_createdAt_idx" ON "Notification"("companyId", "userId", "collapseKey", "createdAt");
CREATE UNIQUE INDEX "NotificationPreference_companyId_userId_category_channel_key" ON "NotificationPreference"("companyId", "userId", "category", "channel");
CREATE INDEX "NotificationPreference_userId_enabled_idx" ON "NotificationPreference"("userId", "enabled");
CREATE INDEX "NotificationPreference_companyId_category_idx" ON "NotificationPreference"("companyId", "category");
CREATE UNIQUE INDEX "NotificationAudienceExpansion_eventId_key" ON "NotificationAudienceExpansion"("eventId");
CREATE INDEX "NotificationAudienceExpansion_status_availableAt_idx" ON "NotificationAudienceExpansion"("status", "availableAt");
CREATE INDEX "NotificationAudienceExpansion_companyId_status_idx" ON "NotificationAudienceExpansion"("companyId", "status");
CREATE INDEX "NotificationAudienceExpansion_leaseExpiresAt_idx" ON "NotificationAudienceExpansion"("leaseExpiresAt");
CREATE UNIQUE INDEX "NotificationTemplate_scopeKey_eventType_channel_locale_version_key" ON "NotificationTemplate"("scopeKey", "eventType", "channel", "locale", "version");
CREATE INDEX "NotificationTemplate_eventType_channel_locale_isActive_idx" ON "NotificationTemplate"("eventType", "channel", "locale", "isActive");
CREATE INDEX "NotificationTemplate_status_updatedAt_idx" ON "NotificationTemplate"("status", "updatedAt");
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");
CREATE INDEX "NotificationOutbox_status_availableAt_priority_idx" ON "NotificationOutbox"("status", "availableAt", "priority");
CREATE INDEX "NotificationOutbox_companyId_createdAt_idx" ON "NotificationOutbox"("companyId", "createdAt");
CREATE INDEX "NotificationOutbox_userId_createdAt_idx" ON "NotificationOutbox"("userId", "createdAt");
CREATE INDEX "NotificationOutbox_eventId_channel_idx" ON "NotificationOutbox"("eventId", "channel");
CREATE INDEX "NotificationOutbox_leaseExpiresAt_idx" ON "NotificationOutbox"("leaseExpiresAt");
CREATE UNIQUE INDEX "NotificationDelivery_outboxId_key" ON "NotificationDelivery"("outboxId");
CREATE UNIQUE INDEX "NotificationDelivery_idempotencyKey_key" ON "NotificationDelivery"("idempotencyKey");
CREATE INDEX "NotificationDelivery_companyId_status_createdAt_idx" ON "NotificationDelivery"("companyId", "status", "createdAt");
CREATE INDEX "NotificationDelivery_userId_createdAt_idx" ON "NotificationDelivery"("userId", "createdAt");
CREATE INDEX "NotificationDelivery_channel_status_createdAt_idx" ON "NotificationDelivery"("channel", "status", "createdAt");
CREATE INDEX "NotificationDelivery_provider_providerMessageId_idx" ON "NotificationDelivery"("provider", "providerMessageId");
CREATE UNIQUE INDEX "NotificationDevice_mobilePushTokenId_key" ON "NotificationDevice"("mobilePushTokenId");
CREATE INDEX "NotificationDevice_companyId_userId_enabled_idx" ON "NotificationDevice"("companyId", "userId", "enabled");
CREATE INDEX "NotificationDevice_platform_enabled_idx" ON "NotificationDevice"("platform", "enabled");
CREATE INDEX "NotificationDevice_invalidatedAt_idx" ON "NotificationDevice"("invalidatedAt");
CREATE UNIQUE INDEX "NotificationAnnouncement_publishedEventId_key" ON "NotificationAnnouncement"("publishedEventId");
CREATE INDEX "NotificationAnnouncement_status_startsAt_idx" ON "NotificationAnnouncement"("status", "startsAt");
CREATE INDEX "NotificationAnnouncement_audience_status_idx" ON "NotificationAnnouncement"("audience", "status");
CREATE INDEX "NotificationAnnouncement_companyId_status_idx" ON "NotificationAnnouncement"("companyId", "status");
CREATE INDEX "NotificationAnnouncement_createdById_createdAt_idx" ON "NotificationAnnouncement"("createdById", "createdAt");
CREATE UNIQUE INDEX "NotificationDeadLetter_outboxId_key" ON "NotificationDeadLetter"("outboxId");
CREATE INDEX "NotificationDeadLetter_companyId_deadLetteredAt_idx" ON "NotificationDeadLetter"("companyId", "deadLetteredAt");
CREATE INDEX "NotificationDeadLetter_channel_deadLetteredAt_idx" ON "NotificationDeadLetter"("channel", "deadLetteredAt");
CREATE INDEX "NotificationDeadLetter_resolvedAt_idx" ON "NotificationDeadLetter"("resolvedAt");
CREATE UNIQUE INDEX "NotificationProviderWebhook_provider_providerEventId_key" ON "NotificationProviderWebhook"("provider", "providerEventId");
CREATE INDEX "NotificationProviderWebhook_provider_createdAt_idx" ON "NotificationProviderWebhook"("provider", "createdAt");
CREATE INDEX "NotificationProviderWebhook_processedAt_idx" ON "NotificationProviderWebhook"("processedAt");

ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationAudienceExpansion" ADD CONSTRAINT "NotificationAudienceExpansion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationAudienceExpansion" ADD CONSTRAINT "NotificationAudienceExpansion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "NotificationOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDevice" ADD CONSTRAINT "NotificationDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDevice" ADD CONSTRAINT "NotificationDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDevice" ADD CONSTRAINT "NotificationDevice_mobilePushTokenId_fkey" FOREIGN KEY ("mobilePushTokenId") REFERENCES "MobilePushToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationAnnouncement" ADD CONSTRAINT "NotificationAnnouncement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationAnnouncement" ADD CONSTRAINT "NotificationAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationAnnouncement" ADD CONSTRAINT "NotificationAnnouncement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationAnnouncement" ADD CONSTRAINT "NotificationAnnouncement_publishedEventId_fkey" FOREIGN KEY ("publishedEventId") REFERENCES "NotificationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationDeadLetter" ADD CONSTRAINT "NotificationDeadLetter_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "NotificationOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDeadLetter" ADD CONSTRAINT "NotificationDeadLetter_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDeadLetter" ADD CONSTRAINT "NotificationDeadLetter_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

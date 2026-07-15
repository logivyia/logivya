ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'REMOVED';

ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "User" SET "emailVerifiedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP);

CREATE TYPE "TrialEntitlementStatus" AS ENUM (
  'PENDING_IDENTITY',
  'ACTIVE',
  'CONSUMED',
  'INELIGIBLE',
  'BLOCKED',
  'PAID_USAGE'
);

CREATE TYPE "InvitationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

ALTER TABLE "CompanyUser"
  ADD COLUMN "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "seatActivatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "removedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "CompanyUser" SET "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP);
ALTER TABLE "CompanyUser" ALTER COLUMN "updatedAt" SET NOT NULL;

UPDATE "CompanyUser" SET "role" = 'OPERATOR' WHERE "role" <> 'OWNER';

ALTER TABLE "CompanyInvitation"
  ADD COLUMN "reservedSeat" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "resendCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastResentAt" TIMESTAMP(3);

UPDATE "CompanyInvitation"
SET "reservedSeat" = FALSE
WHERE status <> 'PENDING' OR "expiresAt" <= CURRENT_TIMESTAMP;

UPDATE "Plan"
SET
  "maxWhatsappAccounts" = CASE
    WHEN slug = 'trial' THEN 1
    WHEN slug = 'starter' THEN 2
    WHEN slug = 'professional' THEN 3
    ELSE "maxWhatsappAccounts"
  END,
  "maxTeamUsers" = CASE
    WHEN slug = 'trial' THEN 1
    WHEN slug = 'starter' THEN 2
    WHEN slug = 'professional' THEN 3
    ELSE "maxTeamUsers"
  END
WHERE slug IN ('trial', 'starter', 'professional');

CREATE TABLE "InvitationDeliveryOutbox" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "appBaseUrl" TEXT NOT NULL,
  "tokenEncrypted" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'tr',
  "status" "InvitationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvitationDeliveryOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionAuditLog" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "previousState" JSONB,
  "newState" JSONB,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingWebhookReceipt" (
  "id" TEXT NOT NULL,
  "provider" "BillingProvider" NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingWebhookReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrialEntitlement" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "whatsappAccountId" TEXT,
  "status" "TrialEntitlementStatus" NOT NULL DEFAULT 'PENDING_IDENTITY',
  "phoneEncrypted" TEXT,
  "phoneHash" TEXT,
  "whatsappIdentityHash" TEXT,
  "registrationPhoneHash" TEXT,
  "registrationIpHash" TEXT,
  "deviceFingerprintHash" TEXT,
  "riskScore" INTEGER NOT NULL DEFAULT 0,
  "riskSignals" JSONB,
  "decisionCode" TEXT,
  "startedAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrialEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvitationDeliveryOutbox_eventKey_key" ON "InvitationDeliveryOutbox"("eventKey");
CREATE INDEX "InvitationDeliveryOutbox_status_availableAt_idx" ON "InvitationDeliveryOutbox"("status", "availableAt");
CREATE INDEX "InvitationDeliveryOutbox_invitationId_createdAt_idx" ON "InvitationDeliveryOutbox"("invitationId", "createdAt");

CREATE INDEX "SubscriptionAuditLog_companyId_createdAt_idx" ON "SubscriptionAuditLog"("companyId", "createdAt");
CREATE INDEX "SubscriptionAuditLog_subscriptionId_createdAt_idx" ON "SubscriptionAuditLog"("subscriptionId", "createdAt");
CREATE INDEX "SubscriptionAuditLog_eventType_createdAt_idx" ON "SubscriptionAuditLog"("eventType", "createdAt");

CREATE UNIQUE INDEX "BillingWebhookReceipt_provider_eventId_key" ON "BillingWebhookReceipt"("provider", "eventId");
CREATE INDEX "BillingWebhookReceipt_status_createdAt_idx" ON "BillingWebhookReceipt"("status", "createdAt");
CREATE INDEX "BillingWebhookReceipt_providerPaymentId_createdAt_idx" ON "BillingWebhookReceipt"("providerPaymentId", "createdAt");

CREATE UNIQUE INDEX "TrialEntitlement_whatsappAccountId_key" ON "TrialEntitlement"("whatsappAccountId");
CREATE UNIQUE INDEX "TrialEntitlement_companyId_userId_key" ON "TrialEntitlement"("companyId", "userId");
CREATE INDEX "TrialEntitlement_phoneHash_status_idx" ON "TrialEntitlement"("phoneHash", "status");
CREATE INDEX "TrialEntitlement_whatsappIdentityHash_status_idx" ON "TrialEntitlement"("whatsappIdentityHash", "status");
CREATE INDEX "TrialEntitlement_registrationPhoneHash_status_idx" ON "TrialEntitlement"("registrationPhoneHash", "status");
CREATE INDEX "TrialEntitlement_registrationIpHash_status_idx" ON "TrialEntitlement"("registrationIpHash", "status");
CREATE INDEX "TrialEntitlement_deviceFingerprintHash_status_idx" ON "TrialEntitlement"("deviceFingerprintHash", "status");
CREATE INDEX "TrialEntitlement_status_createdAt_idx" ON "TrialEntitlement"("status", "createdAt");
CREATE UNIQUE INDEX "TrialEntitlement_consumed_phone_key"
  ON "TrialEntitlement"("phoneHash")
  WHERE "phoneHash" IS NOT NULL AND status IN ('ACTIVE', 'CONSUMED', 'PAID_USAGE');
CREATE UNIQUE INDEX "TrialEntitlement_consumed_identity_key"
  ON "TrialEntitlement"("whatsappIdentityHash")
  WHERE "whatsappIdentityHash" IS NOT NULL AND status IN ('ACTIVE', 'CONSUMED', 'PAID_USAGE');

ALTER TABLE "InvitationDeliveryOutbox"
  ADD CONSTRAINT "InvitationDeliveryOutbox_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "CompanyInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionAuditLog"
  ADD CONSTRAINT "SubscriptionAuditLog_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SubscriptionAuditLog_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SubscriptionAuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrialEntitlement"
  ADD CONSTRAINT "TrialEntitlement_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TrialEntitlement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TrialEntitlement_whatsappAccountId_fkey"
  FOREIGN KEY ("whatsappAccountId") REFERENCES "WhatsAppAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "TrialEntitlement" (
  "id",
  "companyId",
  "userId",
  "status",
  "decisionCode",
  "startedAt",
  "endsAt",
  "consumedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'trial_backfill_' || md5(c.id || ':' || c."ownerId"),
  c.id,
  c."ownerId",
  CASE
    WHEN EXISTS (SELECT 1 FROM "Subscription" s WHERE s."companyId" = c.id AND s.source = 'TRIAL')
      THEN 'CONSUMED'::"TrialEntitlementStatus"
    ELSE 'PAID_USAGE'::"TrialEntitlementStatus"
  END,
  'MIGRATED_EXISTING_COMPANY',
  trial."trialStartsAt",
  trial."trialEndsAt",
  COALESCE(trial."trialStartsAt", c."createdAt"),
  c."createdAt",
  CURRENT_TIMESTAMP
FROM "Company" c
LEFT JOIN LATERAL (
  SELECT s."trialStartsAt", s."trialEndsAt"
  FROM "Subscription" s
  WHERE s."companyId" = c.id AND s.source = 'TRIAL'
  ORDER BY s."createdAt" ASC
  LIMIT 1
) trial ON TRUE
ON CONFLICT ("companyId", "userId") DO NOTHING;

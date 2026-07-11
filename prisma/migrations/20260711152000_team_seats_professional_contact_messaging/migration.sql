DO $$
BEGIN
  CREATE TYPE "CompanyInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MessageTargetType" AS ENUM ('GROUP', 'CONTACT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "CampaignType" ADD VALUE IF NOT EXISTS 'WHATSAPP_MIXED';
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'RETRYING';

ALTER TABLE "Plan"
  ADD COLUMN IF NOT EXISTS "groupMessagingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "contactMessagingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deleteForEveryoneEnabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Plan"
SET
  "maxTeamUsers" = CASE
    WHEN "slug" = 'trial' THEN 1
    WHEN "slug" = 'starter' THEN 2
    WHEN "slug" = 'professional' THEN 3
    ELSE "maxTeamUsers"
  END,
  "groupMessagingEnabled" = CASE WHEN "slug" IN ('trial', 'starter', 'professional', 'enterprise') THEN true ELSE "groupMessagingEnabled" END,
  "contactMessagingEnabled" = CASE WHEN "slug" IN ('trial', 'professional', 'enterprise') THEN true WHEN "slug" = 'starter' THEN false ELSE "contactMessagingEnabled" END,
  "deleteForEveryoneEnabled" = CASE WHEN "slug" IN ('trial', 'starter', 'professional', 'enterprise') THEN true ELSE "deleteForEveryoneEnabled" END
WHERE "slug" IN ('trial', 'starter', 'professional', 'enterprise');

ALTER TABLE "WhatsAppAccount"
  ADD COLUMN IF NOT EXISTS "lastContactSyncAt" TIMESTAMP(3);

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "pushName" TEXT,
  ADD COLUMN IF NOT EXISTS "isWhatsAppUser" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

UPDATE "Contact" AS contact
SET
  "userId" = account."userId",
  "companyId" = account."companyId"
FROM "WhatsAppAccount" AS account
WHERE contact."accountId" = account."id"
  AND (contact."userId" IS DISTINCT FROM account."userId" OR contact."companyId" IS DISTINCT FROM account."companyId");

ALTER TABLE "MessageRecipient"
  ADD COLUMN IF NOT EXISTS "targetType" "MessageTargetType" NOT NULL DEFAULT 'GROUP';

UPDATE "MessageRecipient"
SET "targetType" = CASE WHEN "contactId" IS NOT NULL THEN 'CONTACT'::"MessageTargetType" ELSE 'GROUP'::"MessageTargetType" END;

DO $$
BEGIN
  ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_typed_target_check" CHECK (
    ("targetType" = 'GROUP' AND "groupId" IS NOT NULL AND "contactId" IS NULL)
    OR
    ("targetType" = 'CONTACT' AND "contactId" IS NOT NULL AND "groupId" IS NULL)
  ) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "MessageRecipient" VALIDATE CONSTRAINT "MessageRecipient_typed_target_check";

CREATE TABLE IF NOT EXISTS "CompanyInvitation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "acceptedByUserId" TEXT,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "CompanyRole" NOT NULL DEFAULT 'OPERATOR',
  "status" "CompanyInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInvitation_tokenHash_key" ON "CompanyInvitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "CompanyInvitation_companyId_status_expiresAt_idx" ON "CompanyInvitation"("companyId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "CompanyInvitation_email_status_idx" ON "CompanyInvitation"("email", "status");
CREATE INDEX IF NOT EXISTS "CompanyInvitation_invitedByUserId_idx" ON "CompanyInvitation"("invitedByUserId");
CREATE INDEX IF NOT EXISTS "CompanyInvitation_acceptedByUserId_idx" ON "CompanyInvitation"("acceptedByUserId");

CREATE INDEX IF NOT EXISTS "Contact_userId_idx" ON "Contact"("userId");
CREATE INDEX IF NOT EXISTS "Contact_companyId_idx" ON "Contact"("companyId");
CREATE INDEX IF NOT EXISTS "Contact_accountId_idx" ON "Contact"("accountId");
CREATE INDEX IF NOT EXISTS "Contact_companyId_phone_idx" ON "Contact"("companyId", "phone");
CREATE INDEX IF NOT EXISTS "Contact_phone_idx" ON "Contact"("phone");
CREATE INDEX IF NOT EXISTS "Contact_name_idx" ON "Contact"("name");
CREATE INDEX IF NOT EXISTS "Contact_accountId_isActive_idx" ON "Contact"("accountId", "isActive");
CREATE INDEX IF NOT EXISTS "MessageRecipient_campaignId_targetType_status_idx" ON "MessageRecipient"("campaignId", "targetType", "status");

DO $$
BEGIN
  ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

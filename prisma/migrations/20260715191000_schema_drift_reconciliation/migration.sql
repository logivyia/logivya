-- Encode production schema repairs in migration history so clean databases match Prisma.
ALTER TABLE "MessageRecipient"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "UserMessageVisibility"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "SupportTicket"
  ALTER COLUMN "description" SET DEFAULT '';

-- The unique account/JID index already provides the same lookup prefix.
DROP INDEX IF EXISTS "WhatsAppGroup_accountId_externalGroupId_idx";

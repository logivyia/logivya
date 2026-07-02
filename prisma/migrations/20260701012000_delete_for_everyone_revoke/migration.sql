CREATE TYPE "CampaignDeleteForEveryoneStatus" AS ENUM (
  'NOT_REQUESTED',
  'DELETE_PENDING',
  'DELETE_PROCESSING',
  'PARTIALLY_DELETED',
  'DELETED_FOR_EVERYONE',
  'DELETE_FAILED',
  'DELETE_EXPIRED'
);

CREATE TYPE "DeleteForEveryoneStatus" AS ENUM (
  'NOT_REQUESTED',
  'PENDING',
  'PROCESSING',
  'DELETED',
  'FAILED',
  'EXPIRED'
);

ALTER TABLE "MessageCampaign"
  ADD COLUMN "platformDeletedAt" TIMESTAMP(3),
  ADD COLUMN "deleteForEveryoneStatus" "CampaignDeleteForEveryoneStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "deleteForEveryoneRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deleteForEveryoneCompletedAt" TIMESTAMP(3),
  ADD COLUMN "deleteForEveryoneError" TEXT;

ALTER TABLE "MessageRecipient"
  ADD COLUMN "externalMessageId" TEXT,
  ADD COLUMN "messageKeyJson" JSONB,
  ADD COLUMN "messageKeyFromMe" BOOLEAN,
  ADD COLUMN "messageKeyParticipant" TEXT,
  ADD COLUMN "deleteForEveryoneStatus" "DeleteForEveryoneStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "deleteForEveryoneAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "deleteForEveryoneCompletedAt" TIMESTAMP(3),
  ADD COLUMN "deleteForEveryoneError" TEXT,
  ADD COLUMN "deletedForMeAt" TIMESTAMP(3),
  ADD COLUMN "platformDeletedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "UserMessageVisibility" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "deletedForMeAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMessageVisibility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMessageVisibility_userId_campaignId_key" ON "UserMessageVisibility"("userId", "campaignId");
CREATE INDEX "UserMessageVisibility_campaignId_idx" ON "UserMessageVisibility"("campaignId");
CREATE INDEX "UserMessageVisibility_userId_deletedForMeAt_idx" ON "UserMessageVisibility"("userId", "deletedForMeAt");

CREATE INDEX "MessageRecipient_accountId_recipientExternalId_idx" ON "MessageRecipient"("accountId", "recipientExternalId");
CREATE INDEX "MessageRecipient_deleteForEveryoneStatus_idx" ON "MessageRecipient"("deleteForEveryoneStatus");
CREATE INDEX "MessageRecipient_sentAt_idx" ON "MessageRecipient"("sentAt");

ALTER TABLE "UserMessageVisibility"
  ADD CONSTRAINT "UserMessageVisibility_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserMessageVisibility"
  ADD CONSTRAINT "UserMessageVisibility_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "MessageCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

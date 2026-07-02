import { Client } from "pg";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");

async function exec(client: Client, label: string, sql: string) {
  process.stdout.write(`- ${label}... `);
  await client.query(sql);
  process.stdout.write("ok\n");
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '180s'");

    await exec(client, "ensure enum types", `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignDeleteForEveryoneStatus') THEN
          CREATE TYPE "CampaignDeleteForEveryoneStatus" AS ENUM (
            'NOT_REQUESTED',
            'DELETE_PENDING',
            'DELETE_PROCESSING',
            'PARTIALLY_DELETED',
            'DELETED_FOR_EVERYONE',
            'DELETE_FAILED',
            'DELETE_EXPIRED'
          );
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeleteForEveryoneStatus') THEN
          CREATE TYPE "DeleteForEveryoneStatus" AS ENUM (
            'NOT_REQUESTED',
            'PENDING',
            'PROCESSING',
            'DELETED',
            'FAILED',
            'EXPIRED'
          );
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MobilePlatform') THEN
          CREATE TYPE "MobilePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB', 'UNKNOWN');
        END IF;
      END $$;
    `);

    await exec(client, "company profile columns", `
      ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "city" TEXT;
      ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "district" TEXT;
      ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
    `);

    await exec(client, "message campaign delete columns", `
      ALTER TABLE "MessageCampaign" ADD COLUMN IF NOT EXISTS "platformDeletedAt" TIMESTAMP(3);
      ALTER TABLE "MessageCampaign" ADD COLUMN IF NOT EXISTS "deleteForEveryoneStatus" "CampaignDeleteForEveryoneStatus" NOT NULL DEFAULT 'NOT_REQUESTED';
      ALTER TABLE "MessageCampaign" ADD COLUMN IF NOT EXISTS "deleteForEveryoneRequestedAt" TIMESTAMP(3);
      ALTER TABLE "MessageCampaign" ADD COLUMN IF NOT EXISTS "deleteForEveryoneCompletedAt" TIMESTAMP(3);
      ALTER TABLE "MessageCampaign" ADD COLUMN IF NOT EXISTS "deleteForEveryoneError" TEXT;
    `);

    await exec(client, "message recipient delete columns", `
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "externalMessageId" TEXT;
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "messageKeyJson" JSONB;
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "messageKeyFromMe" BOOLEAN;
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "messageKeyParticipant" TEXT;
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "deleteForEveryoneStatus" "DeleteForEveryoneStatus" NOT NULL DEFAULT 'NOT_REQUESTED';
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "deleteForEveryoneAttemptedAt" TIMESTAMP(3);
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "deleteForEveryoneCompletedAt" TIMESTAMP(3);
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "deleteForEveryoneError" TEXT;
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "deletedForMeAt" TIMESTAMP(3);
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "platformDeletedAt" TIMESTAMP(3);
      ALTER TABLE "MessageRecipient" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

      UPDATE "MessageRecipient"
      SET "updatedAt" = COALESCE("updatedAt", "sentAt", "failedAt", "createdAt", CURRENT_TIMESTAMP)
      WHERE "updatedAt" IS NULL;

      ALTER TABLE "MessageRecipient" ALTER COLUMN "updatedAt" SET NOT NULL;
    `);

    await exec(client, "notification payload", `
      ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "payload" JSONB;
    `);

    await exec(client, "support ticket admin routing columns", `
      ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "source" TEXT;
      ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
      ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "userId" TEXT;
      ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "title" TEXT;
      ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "description" TEXT;
      ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "category" TEXT;

      UPDATE "SupportTicket"
      SET
        "source" = COALESCE("source", 'WEB'),
        "tenantId" = COALESCE("tenantId", "companyId"),
        "userId" = COALESCE("userId", "createdById"),
        "title" = COALESCE("title", NULLIF("subject", ''), 'Destek talebi'),
        "category" = COALESCE("category", NULLIF("type", ''), 'GENERAL');

      UPDATE "SupportTicket" AS ticket
      SET "description" = COALESCE(ticket."description", first_message."message")
      FROM (
        SELECT DISTINCT ON ("ticketId") "ticketId", "message"
        FROM "SupportTicketMessage"
        WHERE "isInternal" = false
        ORDER BY "ticketId", "createdAt" ASC
      ) AS first_message
      WHERE ticket."id" = first_message."ticketId"
        AND ticket."description" IS NULL;

      UPDATE "SupportTicket"
      SET "description" = COALESCE("description", '');

      ALTER TABLE "SupportTicket" ALTER COLUMN "source" SET DEFAULT 'WEB';
      ALTER TABLE "SupportTicket" ALTER COLUMN "source" SET NOT NULL;
      ALTER TABLE "SupportTicket" ALTER COLUMN "tenantId" SET NOT NULL;
      ALTER TABLE "SupportTicket" ALTER COLUMN "userId" SET NOT NULL;
      ALTER TABLE "SupportTicket" ALTER COLUMN "title" SET NOT NULL;
      ALTER TABLE "SupportTicket" ALTER COLUMN "description" SET DEFAULT '';
      ALTER TABLE "SupportTicket" ALTER COLUMN "description" SET NOT NULL;
      ALTER TABLE "SupportTicket" ALTER COLUMN "category" SET NOT NULL;
    `);

    await exec(client, "whatsapp account health and owner columns", `
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "lastPingAt" TIMESTAMP(3);
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "lastPongAt" TIMESTAMP(3);
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "reconnectRetryCount" INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3);
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "lastGroupSyncAt" TIMESTAMP(3);
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "lastConnectionLatencyMs" INTEGER;
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "batteryState" TEXT;
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "healthScore" INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "recoveryLevel" INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "sessionRestoredAt" TIMESTAMP(3);
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "sessionSnapshotAt" TIMESTAMP(3);
      ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "userId" TEXT;

      UPDATE "WhatsAppAccount" AS account
      SET "userId" = company."ownerId"
      FROM "Company" AS company
      WHERE account."companyId" = company."id"
        AND account."userId" IS NULL;
    `);

    await exec(client, "legacy whatsapp status normalization", `
      UPDATE "WhatsAppAccount"
      SET "status" = 'FAILED',
          "lastError" = COALESCE("lastError", 'Baglanti denemesinin suresi doldu. Lutfen tekrar deneyin.'),
          "qrCode" = NULL,
          "qrExpiresAt" = NULL,
          "pairingCode" = NULL,
          "pairingCodeExpiresAt" = NULL
      WHERE "status" IN ('PENDING_QR', 'PENDING_PAIRING', 'QR_READY', 'PAIRING_CODE_READY', 'CONNECTING')
        AND "updatedAt" < NOW() - INTERVAL '10 minutes';

      UPDATE "WhatsAppAccount"
      SET "status" = 'CREATED'
      WHERE "status" IN ('NEW', 'QR_READY', 'ERROR');
    `);

    await exec(client, "whatsapp session telemetry", `
      ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);
      ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "snapshotReason" TEXT;
      ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "restoreCount" INTEGER NOT NULL DEFAULT 0;

      WITH ranked_sessions AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "accountId"
            ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
          ) AS row_number
        FROM "WhatsAppSession"
      )
      DELETE FROM "WhatsAppSession"
      WHERE id IN (
        SELECT id
        FROM ranked_sessions
        WHERE row_number > 1
      );
    `);

    await exec(client, "whatsapp group owner backfill and dedupe", `
      ALTER TABLE "WhatsAppGroup" ADD COLUMN IF NOT EXISTS "userId" TEXT;

      UPDATE "WhatsAppGroup" AS "group"
      SET
        "userId" = account."userId",
        "companyId" = account."companyId"
      FROM "WhatsAppAccount" AS account
      WHERE "group"."accountId" = account."id"
        AND account."userId" IS NOT NULL
        AND (
          "group"."userId" IS DISTINCT FROM account."userId"
          OR "group"."companyId" <> account."companyId"
        );

      CREATE TEMP TABLE "_whatsapp_group_dedupe" ON COMMIT DROP AS
      WITH ranked AS (
        SELECT
          id,
          FIRST_VALUE(id) OVER (
            PARTITION BY "accountId", "externalGroupId"
            ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
          ) AS keep_id,
          ROW_NUMBER() OVER (
            PARTITION BY "accountId", "externalGroupId"
            ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
          ) AS row_number
        FROM "WhatsAppGroup"
      )
      SELECT id AS duplicate_id, keep_id
      FROM ranked
      WHERE row_number > 1;

      DELETE FROM "CategoryGroup" AS category_group
      USING "_whatsapp_group_dedupe" AS dedupe
      WHERE category_group."groupId" = dedupe.duplicate_id
        AND EXISTS (
          SELECT 1
          FROM "CategoryGroup" AS existing
          WHERE existing."categoryId" = category_group."categoryId"
            AND existing."groupId" = dedupe.keep_id
        );

      UPDATE "CategoryGroup" AS category_group
      SET "groupId" = dedupe.keep_id
      FROM "_whatsapp_group_dedupe" AS dedupe
      WHERE category_group."groupId" = dedupe.duplicate_id;

      UPDATE "MessageRecipient" AS recipient
      SET "groupId" = dedupe.keep_id
      FROM "_whatsapp_group_dedupe" AS dedupe
      WHERE recipient."groupId" = dedupe.duplicate_id;

      DELETE FROM "WhatsAppGroup" AS "group"
      USING "_whatsapp_group_dedupe" AS dedupe
      WHERE "group".id = dedupe.duplicate_id;
    `);

    await exec(client, "user message visibility table", `
      CREATE TABLE IF NOT EXISTS "UserMessageVisibility" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "campaignId" TEXT NOT NULL,
        "deletedForMeAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "UserMessageVisibility_pkey" PRIMARY KEY ("id")
      );
    `);

    await exec(client, "mobile feedback table", `
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
    `);

    await exec(client, "indexes", `
      CREATE INDEX IF NOT EXISTS "UserMessageVisibility_campaignId_idx" ON "UserMessageVisibility"("campaignId");
      CREATE INDEX IF NOT EXISTS "UserMessageVisibility_userId_deletedForMeAt_idx" ON "UserMessageVisibility"("userId", "deletedForMeAt");
      CREATE UNIQUE INDEX IF NOT EXISTS "UserMessageVisibility_userId_campaignId_key" ON "UserMessageVisibility"("userId", "campaignId");

      CREATE INDEX IF NOT EXISTS "MobileFeedback_companyId_createdAt_idx" ON "MobileFeedback"("companyId", "createdAt");
      CREATE INDEX IF NOT EXISTS "MobileFeedback_userId_createdAt_idx" ON "MobileFeedback"("userId", "createdAt");
      CREATE INDEX IF NOT EXISTS "MobileFeedback_type_status_idx" ON "MobileFeedback"("type", "status");

      CREATE INDEX IF NOT EXISTS "MessageRecipient_accountId_recipientExternalId_idx" ON "MessageRecipient"("accountId", "recipientExternalId");
      CREATE INDEX IF NOT EXISTS "MessageRecipient_deleteForEveryoneStatus_idx" ON "MessageRecipient"("deleteForEveryoneStatus");
      CREATE INDEX IF NOT EXISTS "MessageRecipient_sentAt_idx" ON "MessageRecipient"("sentAt");

      CREATE INDEX IF NOT EXISTS "Notification_companyId_userId_createdAt_idx" ON "Notification"("companyId", "userId", "createdAt");
      CREATE INDEX IF NOT EXISTS "Notification_companyId_type_createdAt_idx" ON "Notification"("companyId", "type", "createdAt");

      CREATE INDEX IF NOT EXISTS "SupportTicket_companyId_createdAt_idx" ON "SupportTicket"("companyId", "createdAt");
      CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_createdAt_idx" ON "SupportTicket"("tenantId", "createdAt");
      CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_status_createdAt_idx" ON "SupportTicket"("tenantId", "status", "createdAt");
      CREATE INDEX IF NOT EXISTS "SupportTicket_createdById_createdAt_idx" ON "SupportTicket"("createdById", "createdAt");
      CREATE INDEX IF NOT EXISTS "SupportTicket_userId_createdAt_idx" ON "SupportTicket"("userId", "createdAt");
      CREATE INDEX IF NOT EXISTS "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");
      CREATE INDEX IF NOT EXISTS "SupportTicket_type_createdAt_idx" ON "SupportTicket"("type", "createdAt");
      CREATE INDEX IF NOT EXISTS "SupportTicket_category_createdAt_idx" ON "SupportTicket"("category", "createdAt");
      CREATE INDEX IF NOT EXISTS "SupportTicket_source_createdAt_idx" ON "SupportTicket"("source", "createdAt");

      CREATE INDEX IF NOT EXISTS "WhatsAppAccount_userId_idx" ON "WhatsAppAccount"("userId");
      CREATE INDEX IF NOT EXISTS "WhatsAppAccount_userId_companyId_status_idx" ON "WhatsAppAccount"("userId", "companyId", "status");
      CREATE INDEX IF NOT EXISTS "WhatsAppAccount_userId_archivedAt_idx" ON "WhatsAppAccount"("userId", "archivedAt");

      CREATE INDEX IF NOT EXISTS "WhatsAppGroup_userId_idx" ON "WhatsAppGroup"("userId");
      CREATE INDEX IF NOT EXISTS "WhatsAppGroup_companyId_idx" ON "WhatsAppGroup"("companyId");
      CREATE INDEX IF NOT EXISTS "WhatsAppGroup_accountId_idx" ON "WhatsAppGroup"("accountId");
      CREATE INDEX IF NOT EXISTS "WhatsAppGroup_externalGroupId_idx" ON "WhatsAppGroup"("externalGroupId");
      CREATE INDEX IF NOT EXISTS "WhatsAppGroup_companyId_accountId_idx" ON "WhatsAppGroup"("companyId", "accountId");
      CREATE INDEX IF NOT EXISTS "WhatsAppGroup_userId_accountId_idx" ON "WhatsAppGroup"("userId", "accountId");
      CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppGroup_accountId_externalGroupId_key" ON "WhatsAppGroup"("accountId", "externalGroupId");
      CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSession_accountId_key" ON "WhatsAppSession"("accountId");

      DROP INDEX IF EXISTS "WhatsAppGroup_accountId_externalGroupId_idx";
      DROP INDEX IF EXISTS "WhatsAppGroup_companyId_externalGroupId_key";
    `);

    await exec(client, "foreign keys", `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppAccount_userId_fkey') THEN
          ALTER TABLE "WhatsAppAccount"
            ADD CONSTRAINT "WhatsAppAccount_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppGroup_userId_fkey') THEN
          ALTER TABLE "WhatsAppGroup"
            ADD CONSTRAINT "WhatsAppGroup_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserMessageVisibility_userId_fkey') THEN
          ALTER TABLE "UserMessageVisibility"
            ADD CONSTRAINT "UserMessageVisibility_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserMessageVisibility_campaignId_fkey') THEN
          ALTER TABLE "UserMessageVisibility"
            ADD CONSTRAINT "UserMessageVisibility_campaignId_fkey"
            FOREIGN KEY ("campaignId") REFERENCES "MessageCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MobileFeedback_companyId_fkey') THEN
          ALTER TABLE "MobileFeedback"
            ADD CONSTRAINT "MobileFeedback_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MobileFeedback_userId_fkey') THEN
          ALTER TABLE "MobileFeedback"
            ADD CONSTRAINT "MobileFeedback_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await client.query("COMMIT");
    console.log("Production schema reconciliation completed.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

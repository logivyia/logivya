-- Add explicit user ownership for WhatsApp accounts and groups.
ALTER TABLE "WhatsAppAccount" ADD COLUMN "userId" TEXT;
ALTER TABLE "WhatsAppGroup" ADD COLUMN "userId" TEXT;

-- Backfill legacy rows to the owning user of the company. New rows are written with the
-- authenticated user id by the application layer.
UPDATE "WhatsAppAccount" AS account
SET "userId" = company."ownerId"
FROM "Company" AS company
WHERE account."companyId" = company."id"
  AND account."userId" IS NULL;

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

-- If a legacy database already contains duplicate groups inside the same account, merge
-- references into the freshest row before creating the account-scoped unique index.
CREATE TEMP TABLE "_whatsapp_group_dedupe" AS
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

DROP TABLE "_whatsapp_group_dedupe";

ALTER TABLE "WhatsAppGroup" DROP CONSTRAINT IF EXISTS "WhatsAppGroup_companyId_externalGroupId_key";
DROP INDEX IF EXISTS "WhatsAppGroup_companyId_externalGroupId_key";

ALTER TABLE "WhatsAppAccount"
  ADD CONSTRAINT "WhatsAppAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppGroup"
  ADD CONSTRAINT "WhatsAppGroup_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "WhatsAppGroup_accountId_externalGroupId_key"
  ON "WhatsAppGroup"("accountId", "externalGroupId");

CREATE INDEX "WhatsAppAccount_userId_idx" ON "WhatsAppAccount"("userId");
CREATE INDEX "WhatsAppAccount_userId_companyId_status_idx" ON "WhatsAppAccount"("userId", "companyId", "status");
CREATE INDEX "WhatsAppAccount_userId_archivedAt_idx" ON "WhatsAppAccount"("userId", "archivedAt");
CREATE INDEX "WhatsAppGroup_userId_idx" ON "WhatsAppGroup"("userId");
CREATE INDEX "WhatsAppGroup_companyId_idx" ON "WhatsAppGroup"("companyId");
CREATE INDEX "WhatsAppGroup_accountId_idx" ON "WhatsAppGroup"("accountId");
CREATE INDEX "WhatsAppGroup_externalGroupId_idx" ON "WhatsAppGroup"("externalGroupId");
CREATE INDEX "WhatsAppGroup_companyId_accountId_idx" ON "WhatsAppGroup"("companyId", "accountId");
CREATE INDEX "WhatsAppGroup_userId_accountId_idx" ON "WhatsAppGroup"("userId", "accountId");

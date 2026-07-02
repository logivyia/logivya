CREATE TEMP TABLE "_WhatsAppGroupDuplicateKeepers" ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    "id" AS "duplicateId",
    FIRST_VALUE("id") OVER (
      PARTITION BY "companyId", "externalGroupId"
      ORDER BY "updatedAt" DESC, "lastSyncedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS "keepId",
    ROW_NUMBER() OVER (
      PARTITION BY "companyId", "externalGroupId"
      ORDER BY "updatedAt" DESC, "lastSyncedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS "rank"
  FROM "WhatsAppGroup"
)
SELECT "duplicateId", "keepId"
FROM ranked
WHERE "rank" > 1;

UPDATE "CategoryGroup" AS cg
SET "groupId" = d."keepId"
FROM "_WhatsAppGroupDuplicateKeepers" AS d
WHERE cg."groupId" = d."duplicateId"
  AND NOT EXISTS (
    SELECT 1
    FROM "CategoryGroup" AS existing
    WHERE existing."categoryId" = cg."categoryId"
      AND existing."groupId" = d."keepId"
  );

DELETE FROM "CategoryGroup" AS cg
USING "_WhatsAppGroupDuplicateKeepers" AS d
WHERE cg."groupId" = d."duplicateId";

UPDATE "MessageRecipient" AS mr
SET
  "groupId" = d."keepId",
  "accountId" = keeper."accountId",
  "recipientName" = keeper."name",
  "recipientExternalId" = keeper."externalGroupId"
FROM "_WhatsAppGroupDuplicateKeepers" AS d
JOIN "WhatsAppGroup" AS keeper ON keeper."id" = d."keepId"
WHERE mr."groupId" = d."duplicateId";

DELETE FROM "WhatsAppGroup" AS wg
USING "_WhatsAppGroupDuplicateKeepers" AS d
WHERE wg."id" = d."duplicateId";

ALTER TABLE "WhatsAppGroup" DROP CONSTRAINT IF EXISTS "WhatsAppGroup_accountId_externalGroupId_key";
DROP INDEX IF EXISTS "WhatsAppGroup_accountId_externalGroupId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppGroup_companyId_externalGroupId_key" ON "WhatsAppGroup"("companyId", "externalGroupId");
CREATE INDEX IF NOT EXISTS "WhatsAppGroup_accountId_externalGroupId_idx" ON "WhatsAppGroup"("accountId", "externalGroupId");

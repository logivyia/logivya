-- WhatsApp Connection Engine V5
-- Keep the newest durable session snapshot per account, then enforce one snapshot row.
WITH ranked_sessions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "accountId"
      ORDER BY
        "updatedAt" DESC NULLS LAST,
        "createdAt" DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM "WhatsAppSession"
)
DELETE FROM "WhatsAppSession"
WHERE id IN (
  SELECT id
  FROM ranked_sessions
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSession_accountId_key"
  ON "WhatsAppSession"("accountId");

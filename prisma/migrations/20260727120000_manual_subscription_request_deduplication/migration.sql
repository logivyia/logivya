ALTER TABLE "SubscriptionRequest"
  ADD COLUMN IF NOT EXISTS "activeRequestKey" TEXT;

WITH ranked_requests AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "companyId", "planCode", "billingPeriod"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS request_rank
  FROM "SubscriptionRequest"
  WHERE "status" IN (
    'DRAFT',
    'AWAITING_PAYMENT',
    'UNDER_REVIEW',
    'CLARIFICATION_REQUIRED'
  )
)
UPDATE "SubscriptionRequest" AS request
SET "activeRequestKey" = CASE
  WHEN ranked_requests.request_rank = 1 THEN
    md5(request."companyId" || ':' || request."planCode" || ':' || request."billingPeriod"::text)
  ELSE NULL
END
FROM ranked_requests
WHERE request."id" = ranked_requests."id";

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionRequest_activeRequestKey_key"
  ON "SubscriptionRequest"("activeRequestKey");

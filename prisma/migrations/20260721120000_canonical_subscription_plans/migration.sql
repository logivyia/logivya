-- Canonical LOGIVYA plan catalog. Existing subscriptions and paid-through dates are preserved.
INSERT INTO "Plan" (
  "id", "name", "slug", "description", "monthlyPrice", "yearlyPrice", "currency", "trialDays",
  "maxWhatsappAccounts", "maxTeamUsers", "maxGroups", "maxMessagesPerDay", "maxMessagesPerMonth",
  "groupMessagingEnabled", "contactMessagingEnabled", "deleteForEveryoneEnabled", "advertisingEnabled",
  "hasScheduledMessages", "hasRecurringMessages", "advancedReportingEnabled", "hasNoBranding", "hasCrm",
  "hasApi", "isPopular", "isCustom", "isActive", "createdAt", "updatedAt"
)
VALUES
  ('canonical-plan-trial-20260721', 'Trial', 'trial', 'Seven-day full-access trial.', 0, 0, 'TRY', 7, 1, 1, 2147483647, 2147483647, 2147483647, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('canonical-plan-starter-20260721', 'Starter', 'starter', 'Core messaging for contacts and groups.', 280, 3000, 'TRY', 0, 2, 2, 2147483647, 2147483647, 2147483647, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('canonical-plan-professional-20260721', 'Professional', 'professional', 'Unbranded professional messaging.', 380, 4200, 'TRY', 0, 3, 3, 2147483647, 2147483647, 2147483647, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

UPDATE "Plan"
SET
  "name" = 'Deneme',
  "description" = 'Logivya’yı 7 gün boyunca ücretsiz deneyin.',
  "monthlyPrice" = 0,
  "yearlyPrice" = 0,
  "currency" = 'TRY',
  "trialDays" = 7,
  "maxWhatsappAccounts" = 1,
  "maxTeamUsers" = 1,
  "maxGroups" = 2147483647,
  "maxMessagesPerDay" = 2147483647,
  "maxMessagesPerMonth" = 2147483647,
  "groupMessagingEnabled" = TRUE,
  "contactMessagingEnabled" = TRUE,
  "deleteForEveryoneEnabled" = TRUE,
  "advertisingEnabled" = TRUE,
  "hasScheduledMessages" = TRUE,
  "hasRecurringMessages" = TRUE,
  "hasNoBranding" = FALSE,
  "isPopular" = FALSE,
  "isCustom" = FALSE,
  "isActive" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'trial';

UPDATE "Plan"
SET
  "name" = 'Başlangıç',
  "description" = 'Temel mesajlaşma, kişi ve grup yönetimi ihtiyaçları için uygun plan.',
  "monthlyPrice" = 280,
  "yearlyPrice" = 3000,
  "currency" = 'TRY',
  "trialDays" = 0,
  "maxWhatsappAccounts" = 2,
  "maxTeamUsers" = 2,
  "maxGroups" = 2147483647,
  "maxMessagesPerDay" = 2147483647,
  "maxMessagesPerMonth" = 2147483647,
  "groupMessagingEnabled" = TRUE,
  "contactMessagingEnabled" = TRUE,
  "deleteForEveryoneEnabled" = TRUE,
  "advertisingEnabled" = TRUE,
  "hasScheduledMessages" = TRUE,
  "hasRecurringMessages" = TRUE,
  "hasNoBranding" = FALSE,
  "isPopular" = FALSE,
  "isCustom" = FALSE,
  "isActive" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'starter';

UPDATE "Plan"
SET
  "name" = 'Profesyonel',
  "description" = 'Reklamsız ve gelişmiş mesajlaşma operasyonları için profesyonel plan.',
  "monthlyPrice" = 380,
  "yearlyPrice" = 4200,
  "currency" = 'TRY',
  "trialDays" = 0,
  "maxWhatsappAccounts" = 3,
  "maxTeamUsers" = 3,
  "maxGroups" = 2147483647,
  "maxMessagesPerDay" = 2147483647,
  "maxMessagesPerMonth" = 2147483647,
  "groupMessagingEnabled" = TRUE,
  "contactMessagingEnabled" = TRUE,
  "deleteForEveryoneEnabled" = TRUE,
  "advertisingEnabled" = FALSE,
  "hasScheduledMessages" = TRUE,
  "hasRecurringMessages" = TRUE,
  "hasNoBranding" = TRUE,
  "isPopular" = FALSE,
  "isCustom" = FALSE,
  "isActive" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'professional';

-- Repoint legacy subscriptions without deleting subscriptions, payments or audit history.
WITH legacy_mapping AS (
  SELECT legacy."id" AS "legacyPlanId", canonical."id" AS "canonicalPlanId"
  FROM "Plan" legacy
  JOIN "Plan" canonical ON canonical."slug" = CASE
    WHEN LOWER(legacy."slug") IN ('free', 'deneme')
      OR LOWER(legacy."name") IN ('trial', 'free', 'deneme') THEN 'trial'
    WHEN LOWER(legacy."slug") IN ('basic', 'beginning', 'baslangic', 'başlangıç')
      OR LOWER(legacy."name") IN ('starter', 'basic', 'beginning', 'baslangic', 'başlangıç') THEN 'starter'
    WHEN LOWER(legacy."slug") IN ('pro', 'profesyonel')
      OR LOWER(legacy."name") IN ('professional', 'pro', 'profesyonel') THEN 'professional'
    ELSE NULL
  END
)
UPDATE "Subscription" subscription
SET "planId" = mapping."canonicalPlanId", "updatedAt" = CURRENT_TIMESTAMP
FROM legacy_mapping mapping
WHERE subscription."planId" = mapping."legacyPlanId"
  AND mapping."legacyPlanId" <> mapping."canonicalPlanId";

-- Legacy plans remain queryable for historical subscriptions but are not offered to new customers.
UPDATE "Plan"
SET "isActive" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" NOT IN ('trial', 'starter', 'professional') AND "isActive" = TRUE;

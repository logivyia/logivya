-- The trial plan is the single database representation of the seven-day policy.
-- Paid plans and administrator-assigned subscriptions are intentionally excluded.
UPDATE "Plan"
SET
  "trialDays" = 7,
  "description" = 'İlk kayıt olan kullanıcılar için 7 günlük ücretsiz deneme.',
  "maxGroups" = 2147483647,
  "maxMessagesPerDay" = 2147483647,
  "maxMessagesPerMonth" = 2147483647,
  "hasScheduledMessages" = TRUE,
  "hasRecurringMessages" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'trial';

-- Extend only active TRIALING records whose recorded trial interval is approximately
-- 72 hours. Expired trials, paid plans, promo subscriptions and manually extended
-- trials remain untouched. The new end is seven days from the original start.
UPDATE "Subscription" AS subscription
SET
  "trialEndsAt" = subscription."trialStartsAt" + INTERVAL '7 days',
  "endsAt" = CASE
    WHEN subscription."endsAt" IS NULL
      OR subscription."endsAt" <= subscription."trialStartsAt" + INTERVAL '73 hours'
    THEN subscription."trialStartsAt" + INTERVAL '7 days'
    ELSE subscription."endsAt"
  END,
  "currentPeriodEndsAt" = CASE
    WHEN subscription."currentPeriodEndsAt" IS NULL
      OR subscription."currentPeriodEndsAt" <= subscription."trialStartsAt" + INTERVAL '73 hours'
    THEN subscription."trialStartsAt" + INTERVAL '7 days'
    ELSE subscription."currentPeriodEndsAt"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Plan" AS plan
WHERE subscription."planId" = plan."id"
  AND plan."slug" = 'trial'
  AND subscription."source" = 'TRIAL'
  AND subscription."status" = 'TRIALING'
  AND subscription."trialStartsAt" IS NOT NULL
  AND subscription."trialEndsAt" IS NOT NULL
  AND subscription."trialEndsAt" > CURRENT_TIMESTAMP
  AND subscription."trialEndsAt" BETWEEN
    subscription."trialStartsAt" + INTERVAL '71 hours'
    AND subscription."trialStartsAt" + INTERVAL '73 hours';

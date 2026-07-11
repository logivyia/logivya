ALTER TABLE "CompanyInvitation"
  ADD COLUMN IF NOT EXISTS "shortCodeHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInvitation_shortCodeHash_key"
  ON "CompanyInvitation"("shortCodeHash");

UPDATE "CompanyInvitation"
SET "status" = 'EXPIRED'
WHERE "status" = 'PENDING' AND "expiresAt" <= NOW();

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInvitation_one_pending_email_per_company"
  ON "CompanyInvitation"("companyId", LOWER("email"))
  WHERE "status" = 'PENDING';

ALTER TABLE "MessageRecipient"
  ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Plan"
SET
  "monthlyPrice" = CASE
    WHEN "slug" = 'starter' THEN 280
    WHEN "slug" = 'professional' THEN 380
    ELSE "monthlyPrice"
  END,
  "maxTeamUsers" = CASE
    WHEN "slug" = 'trial' THEN 1
    WHEN "slug" = 'starter' THEN 2
    WHEN "slug" = 'professional' THEN 3
    ELSE "maxTeamUsers"
  END,
  "groupMessagingEnabled" = CASE
    WHEN "slug" IN ('trial', 'starter', 'professional') THEN true
    ELSE "groupMessagingEnabled"
  END,
  "contactMessagingEnabled" = CASE
    WHEN "slug" IN ('trial', 'professional') THEN true
    WHEN "slug" = 'starter' THEN false
    ELSE "contactMessagingEnabled"
  END,
  "deleteForEveryoneEnabled" = CASE
    WHEN "slug" IN ('trial', 'starter', 'professional') THEN true
    ELSE "deleteForEveryoneEnabled"
  END,
  "advertisingEnabled" = CASE
    WHEN "slug" IN ('trial', 'starter') THEN true
    WHEN "slug" = 'professional' THEN false
    ELSE "advertisingEnabled"
  END,
  "hasNoBranding" = CASE
    WHEN "slug" IN ('trial', 'starter') THEN false
    WHEN "slug" = 'professional' THEN true
    ELSE "hasNoBranding"
  END,
  "hasScheduledMessages" = CASE WHEN "slug" IN ('trial', 'starter', 'professional') THEN true ELSE "hasScheduledMessages" END,
  "hasRecurringMessages" = CASE WHEN "slug" IN ('trial', 'starter', 'professional') THEN true ELSE "hasRecurringMessages" END
WHERE "slug" IN ('trial', 'starter', 'professional');

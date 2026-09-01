-- Additive tenant membership lifecycle migration.
-- No company, user, membership, subscription, or request row is deleted.

CREATE TYPE "MembershipLifecycleState" AS ENUM (
  'PENDING_ACTIVATION',
  'ACTIVE_SHARED_MEMBER',
  'SUSPENDED_FOR_SECURITY',
  'SHARED_SUBSCRIPTION_EXPIRED',
  'DETACHED',
  'INDEPENDENT_OWNER',
  'REMOVED_BEFORE_ACTIVATION'
);

CREATE TYPE "SubscriptionRequestPurpose" AS ENUM (
  'TENANT_PLAN',
  'SHARED_MEMBER_CONVERSION'
);

ALTER TYPE "PrivacyDeletionScope" ADD VALUE IF NOT EXISTS 'MEMBERSHIP';

ALTER TABLE "CompanyUser"
  ADD COLUMN "lifecycleState" "MembershipLifecycleState",
  ADD COLUMN "activationCompletedAt" TIMESTAMP(3),
  ADD COLUMN "sharedAccessExpiredAt" TIMESTAMP(3),
  ADD COLUMN "detachedAt" TIMESTAMP(3),
  ADD COLUMN "independentConvertedAt" TIMESTAMP(3);

-- Owners always retain their independent tenant ownership.
UPDATE "CompanyUser"
SET
  "lifecycleState" = 'INDEPENDENT_OWNER',
  "activationCompletedAt" = COALESCE("activationCompletedAt", "joinedAt", "createdAt")
WHERE "role" = 'OWNER';

-- A removed account that never replaced its temporary password was cancelled
-- before activation. Other removed memberships are detached historical rows.
UPDATE "CompanyUser" AS membership
SET
  "lifecycleState" = CASE
    WHEN users."mustChangePassword" = true
      THEN 'REMOVED_BEFORE_ACTIVATION'::"MembershipLifecycleState"
    ELSE 'DETACHED'::"MembershipLifecycleState"
  END,
  "detachedAt" = COALESCE(membership."detachedAt", membership."removedAt", CURRENT_TIMESTAMP)
FROM "User" AS users
WHERE
  membership."userId" = users."id"
  AND membership."role" <> 'OWNER'
  AND membership."status" = 'REMOVED';

UPDATE "CompanyUser"
SET "lifecycleState" = 'SUSPENDED_FOR_SECURITY'
WHERE
  "role" <> 'OWNER'
  AND "status" = 'SUSPENDED';

-- Platform security suspension is user-authoritative and can apply to owners or
-- shared members without rewriting normal tenant membership status.
UPDATE "CompanyUser" AS membership
SET "lifecycleState" = 'SUSPENDED_FOR_SECURITY'
FROM "User" AS users
WHERE
  membership."userId" = users."id"
  AND membership."status" <> 'REMOVED'
  AND users."status" = 'SUSPENDED';

-- Temporary-password users have not activated their shared membership yet.
UPDATE "CompanyUser" AS membership
SET "lifecycleState" = 'PENDING_ACTIVATION'
FROM "User" AS users
WHERE
  membership."userId" = users."id"
  AND membership."role" <> 'OWNER'
  AND membership."status" IN ('ACTIVE', 'INVITED')
  AND users."status" <> 'SUSPENDED'
  AND users."mustChangePassword" = true;

-- Activated shared members inherit the current company subscription. The
-- effective dates mirror the canonical entitlement resolver.
UPDATE "CompanyUser" AS membership
SET
  "lifecycleState" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "Subscription" AS subscription
      WHERE
        subscription."companyId" = membership."companyId"
        AND subscription."status" IN ('ACTIVE', 'TRIALING')
        AND COALESCE(
          subscription."currentPeriodStartsAt",
          subscription."startsAt",
          subscription."trialStartsAt",
          '-infinity'::timestamp
        ) <= CURRENT_TIMESTAMP
        AND COALESCE(
          subscription."currentPeriodEndsAt",
          subscription."endsAt",
          subscription."trialEndsAt",
          'infinity'::timestamp
        ) > CURRENT_TIMESTAMP
    )
      THEN 'ACTIVE_SHARED_MEMBER'::"MembershipLifecycleState"
    ELSE 'SHARED_SUBSCRIPTION_EXPIRED'::"MembershipLifecycleState"
  END,
  "activationCompletedAt" = COALESCE(
    membership."activationCompletedAt",
    membership."joinedAt",
    membership."createdAt"
  ),
  "sharedAccessExpiredAt" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "Subscription" AS subscription
      WHERE
        subscription."companyId" = membership."companyId"
        AND subscription."status" IN ('ACTIVE', 'TRIALING')
        AND COALESCE(
          subscription."currentPeriodEndsAt",
          subscription."endsAt",
          subscription."trialEndsAt",
          'infinity'::timestamp
        ) > CURRENT_TIMESTAMP
    )
      THEN NULL
    ELSE COALESCE(membership."sharedAccessExpiredAt", CURRENT_TIMESTAMP)
  END
FROM "User" AS users
WHERE
  membership."userId" = users."id"
  AND membership."role" <> 'OWNER'
  AND membership."status" = 'ACTIVE'
  AND users."status" <> 'SUSPENDED'
  AND users."mustChangePassword" = false;

-- Defensive fallback for any legacy state not covered above.
UPDATE "CompanyUser"
SET "lifecycleState" = CASE
  WHEN "role" = 'OWNER'
    THEN 'INDEPENDENT_OWNER'::"MembershipLifecycleState"
  ELSE 'DETACHED'::"MembershipLifecycleState"
END
WHERE "lifecycleState" IS NULL;

ALTER TABLE "CompanyUser"
  ALTER COLUMN "lifecycleState" SET NOT NULL;

CREATE INDEX "CompanyUser_companyId_lifecycleState_idx"
  ON "CompanyUser"("companyId", "lifecycleState");
CREATE INDEX "CompanyUser_userId_lifecycleState_idx"
  ON "CompanyUser"("userId", "lifecycleState");

ALTER TABLE "SubscriptionRequest"
  ADD COLUMN "purpose" "SubscriptionRequestPurpose" NOT NULL DEFAULT 'TENANT_PLAN',
  ADD COLUMN "sourceCompanyId" TEXT,
  ADD COLUMN "sourceMembershipId" TEXT,
  ADD COLUMN "conversionCompanyId" TEXT;

CREATE INDEX "SubscriptionRequest_purpose_status_createdAt_idx"
  ON "SubscriptionRequest"("purpose", "status", "createdAt");
CREATE INDEX "SubscriptionRequest_sourceMembershipId_createdAt_idx"
  ON "SubscriptionRequest"("sourceMembershipId", "createdAt");
CREATE INDEX "SubscriptionRequest_conversionCompanyId_idx"
  ON "SubscriptionRequest"("conversionCompanyId");

# Manual Subscription Request Migration Safety

Migration: `20260726120000_manual_subscription_requests`

## Scope

The migration is additive. It creates:

- `SubscriptionRequestStatus`
- `SubscriptionRequestActorType`
- `BillingLegalDocumentType`
- `SubscriptionRequest`
- `SubscriptionRequestConsent`
- `SubscriptionRequestTransition`
- `BillingSellerConfiguration`

It adds foreign keys and indexes but does not update, delete, truncate, rename, or
drop existing production records.

## Preflight

Run these checks against a read-only production connection before applying the
migration:

```sql
SELECT current_database(), current_schema();
SELECT COUNT(*) AS companies FROM "Company";
SELECT COUNT(*) AS users FROM "User";
SELECT COUNT(*) AS plans FROM "Plan";
SELECT COUNT(*) AS subscriptions FROM "Subscription";
SELECT "slug", "isActive" FROM "Plan" WHERE "slug" IN ('starter', 'professional');
```

Both canonical paid plans must exist and be active. Preserve the output with the
deployment evidence.

## Apply

1. Complete and verify an encrypted production backup.
2. Apply with `prisma migrate deploy`.
3. Run `prisma migrate status`.
4. Confirm all four new tables exist.
5. Confirm existing `Company`, `User`, `Plan`, and `Subscription` counts did not
   decrease.
6. Do not enable paid checkout until the administrator has entered verified
   LOGIVYA seller identity and confirmed professional legal review.

## Rollback Boundary

The application can be rolled back while leaving the additive tables in place.
Do not drop the new tables after requests have been created because they contain
legal consent and audit evidence. A destructive database rollback requires a
separate, reviewed data-retention plan.

## Production Status

The migration file has been generated and validated locally. It has not been
applied to production by this implementation task.

# Subscription, Seat, Invitation and Trial Migration Safety Report

Generated: 2026-07-15 11:32 Europe/Istanbul

## Scope

- Target migration: `20260715170000_company_subscription_seat_invitation_trial_governance`
- Production database: Neon PostgreSQL (`ep-proud-salad-aty4tnu7-pooler.c-9.us-east-1.aws.neon.tech`)
- Audit mode: read-only
- Fresh-install verification: PostgreSQL 16 Docker database

## Production Preflight

| Check | Result |
| --- | ---: |
| Duplicate active subscriptions per company | 0 |
| Orphan memberships | 0 |
| Companies without an active owner membership | 0 |
| Duplicate live pending invitations | 0 |
| Orphan invitations | 0 |
| Expired pending invitations | 0 |
| Companies over the authoritative user-seat limit | 0 |
| Companies over the authoritative WhatsApp connection limit | 0 |
| WhatsApp account ownership mismatches | 0 |
| Duplicate verified trial identities | 0 |
| Orphan invitation delivery rows | 0 |

Result: `safeToMigrate: true`.

The report is reproducible with:

```powershell
npm run audit:subscription-seat-trial-migration
```

## Migration Chain Verification

The repository originally started with incremental migrations and had no initial schema migration. A baseline generated from Git commit `09cc53c9`, immediately before the first incremental migration, is now stored as `20260611000000_initial_production_baseline`.

The historical WhatsApp group deduplication migration used an `ON COMMIT DROP` temporary relation. Its checksum was deliberately left unchanged. Two idempotent replay-guard migrations make a clean replay possible without modifying an already-applied production migration.

All 33 migrations were applied successfully, in order, to an empty PostgreSQL 16 database.

## Production Deployment Order

The production schema already contains the baseline objects. The baseline must therefore be recorded as already applied before normal deployment; its SQL must not execute against production.

```powershell
npx prisma migrate resolve --applied 20260611000000_initial_production_baseline
npx prisma migrate deploy
npm run audit:subscription-seat-trial-migration
```

The replay-guard migrations only create and remove an empty helper relation. They do not update or delete WhatsApp groups. The target governance migration is additive except for deliberate normalization/backfill updates; it contains no `DELETE`, `TRUNCATE`, or destructive table drop.

## Integration Evidence

- Verified WhatsApp trial start, seven-day duration, idempotent reconnect and cross-account identity replay prevention passed.
- Starter and Professional seat enforcement, pending-seat reservation, concurrent final-seat race, one-time invitation acceptance, member removal, subscription inheritance and contact isolation passed.
- No production write was made during this audit.

## Production Result

The baseline was recorded without executing its SQL. The two replay guards, the governance migration and the support priority-rank migration were then applied successfully. `prisma migrate status` reports the production schema as up to date.

The post-migration audit detected both `TrialEntitlement` and `InvitationDeliveryOutbox`; every blocking count remained zero and `safeToMigrate` remained `true`.

# Database Migration Policy

## Required sequence

1. Run `npm run audit:migration-safety` and `npm run audit:database-integrity` against the target data.
2. Create and verify an encrypted backup. For production, require both storage boundaries.
3. Use expand-and-contract: add nullable fields/tables/indexes, deploy compatible code, backfill in bounded batches, validate, add constraints, remove obsolete fields only in a later release.
4. Apply migrations with `npx prisma migrate deploy`; never use `prisma db push` in production.
5. Run migration status, schema drift, foreign-key, uniqueness, orphan and tenant-isolation checks.
6. Deploy web/API and worker only after schema compatibility is proven.

## Safety rules

- No destructive migration without a reviewed data export, restore proof and rollback/forward-fix plan.
- No constraint is added before duplicate, orphan and invalid-owner checks pass.
- Raw `ON CONFLICT` statements require an exactly matching unique or exclusion constraint in production.
- Large backfills are restartable, observable and separate from request transactions.
- New application code must tolerate the old and expanded schema during rolling deployment.
- Prisma drift caused by intentional SQL indexes is documented rather than silently ignored.

## Failure handling

Stop on the first migration error. Do not mark a failed migration resolved until the database state is inspected. Transactional DDL must roll back without partial objects; a 2026-07-15 isolated test forced a foreign-key failure and confirmed the probe table was absent after rollback. Use `prisma migrate resolve` only with a reviewed explanation and matching schema evidence.

## Current candidate

`20260715190000_durable_queue_recovery` is additive: two nullable MessageCampaign columns plus one unique and one lookup index. `20260715191000_schema_drift_reconciliation` records four metadata-only production repairs: two default removals, one default addition and removal of a redundant non-unique group index already covered by the unique account/JID index. Both passed a clean PostgreSQL 17 deployment and schema validation. Neither has been applied to production in this audit workspace.

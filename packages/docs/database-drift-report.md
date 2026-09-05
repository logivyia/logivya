# Database Drift Report

Audit date: 2026-07-15. Target: production Neon PostgreSQL 17.10.

## Evidence

- `npx prisma migrate status`: 33 migrations found; database reported up to date; zero incomplete migration rows.
- Initial database-to-schema diff found four descending support indexes represented as ascending in Prisma, two PostgreSQL trigram indexes absent from Prisma, and a database default on `SupportNotificationOutbox.updatedAt` absent from Prisma.
- `prisma/migrations/migration_lock.toml` was missing, preventing migration-directory drift checks.
- The Prisma schema was aligned to the existing production shape without applying database DDL.
- Post-remediation `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code`: no difference, exit 0.

## Constraint and ownership checks

- 170 foreign-key constraints are validated; no unvalidated constraints were found.
- `CompanyUser(companyId,userId)`, `WhatsAppSession(accountId)`, `WhatsAppGroup(accountId,externalGroupId)`, and `Contact(accountId,externalContactId)` have matching unique indexes.
- Raw `ON CONFLICT (companyId,userId)` is backed by `CompanyUser_companyId_userId_key`.
- Raw support migration `ON CONFLICT (id)` targets primary keys.
- Duplicate memberships, sessions, groups and contacts: 0.
- Group company/user ownership mismatches: 0/0.
- Contact company/user ownership mismatches: 0/0.

## Snapshot consistency finding

Three `WhatsAppSession` rows contain encrypted snapshots. Four WhatsApp accounts have snapshot metadata but no encrypted snapshot row. Metadata must not be treated as proof of recoverability; the verification job reports this condition and the existing runtime clears stale metadata when it encounters it.

## Remaining limitation

The partial GIN index `SupportTicketMessage_message_trgm_idx` is intentionally maintained in SQL. Prisma 7.8 requires the `partialIndexes` preview feature to model its predicate. Enabling that preview feature solely to silence introspection was rejected; the migration and integrity audit verify the index explicitly instead.

Migration-directory-to-database diff requires an isolated shadow database in Prisma 7.8. CI provides that database; production is never used as a shadow target.

The repository now contains additive candidate migration `20260715190000_durable_queue_recovery` and metadata-only reconciliation migration `20260715191000_schema_drift_reconciliation`. A clean PostgreSQL 17 database built from the complete migration history matches `prisma/schema.prisma`; production remains at the 33-migration baseline until the release gate and backup activation are approved.

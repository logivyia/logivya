# Production Rollback Runbook

Rollback is service-specific. Database migrations use forward-compatible recovery; do not blindly reverse schema changes after writes have begun.

## Web and API on Vercel

1. Freeze new deployments and identify the last verified deployment ID and source commit.
2. Confirm the target deployment expects the currently deployed schema.
3. Use Vercel deployment rollback/promote controls to restore the verified deployment.
4. Verify `/api/health`, `/api/health/db`, `/api/health/redis`, auth/current-user, support and read-only campaign history.

## WhatsApp worker on Render

1. Pause auto-deploy before changing source.
2. Select the verified commit/image compatible with the current schema and session encryption key.
3. Deploy one worker instance, verify heartbeat and session recovery, then restore normal capacity.
4. Run queue reconciliation and verify no duplicate recipient delivery, reconnect storm or cross-account socket ownership.

Do not delete the persistent session disk. PostgreSQL encrypted snapshots remain the recovery source when disk state is unavailable.

## Database

- Additive nullable columns and indexes normally remain during application rollback.
- If a migration failed before commit, stop deployment and verify the transaction left no partial schema.
- If a migration succeeded and data was written, prefer a forward-fix migration.
- Restore from backup/PITR only for confirmed data corruption or destructive change, using the isolated restore runbook first.

## Redis and queues

Redis may be cleared or replaced after the database is stable. Start the worker and allow `reconcileDurableMessageQueues` to rebuild pending send, scheduled, recurring and pending Delete for Everyone jobs from PostgreSQL. Deterministic job IDs and atomic recipient claims prevent duplicate target delivery.

## Android

Google Play does not downgrade installed apps. Stop or supersede a faulty rollout and publish a fixed AAB with a higher `versionCode`, the same package and upload-key lineage. Never reuse an accepted version code.

## Decision log

Record trigger, affected release, rollback target, operator, timestamps, schema compatibility, verification evidence and follow-up. The production Vercel/Render rollback control itself was not exercised during the 2026-07-15 audit to avoid customer impact; it remains a required supervised drill.

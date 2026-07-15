# Production Backup Policy

Audit baseline: 2026-07-15. PostgreSQL is the authoritative store for customer, subscription, support, WhatsApp metadata, encrypted session snapshots, campaigns and message history.

## Implemented controls

- `.github/workflows/database-backup.yml` schedules a daily encrypted logical backup at 01:43 UTC and supports manual dispatch.
- `scripts/backup/create-database-backup.mjs` exports one PostgreSQL repeatable-read snapshot, streams `pg_dump` directly into AES-256-GCM encryption and never persists a plaintext dump.
- Every manifest is authenticated with HMAC and records backup ID, correlation ID, size, SHA-256, key ID, status history, row counts, migration count, retention expiry and storage identifiers.
- A backup reaches `VERIFIED` only after checksum validation, authenticated decryption, `pg_restore --list` parsing and required-table validation.
- Upload requires a private primary S3-compatible destination. Production automation also requires an independently credentialed secondary destination.
- The workflow preserves an additional encrypted GitHub Actions artifact for 14 days and emits a sanitized failure webhook when configured.

## Retention

| Copy | Retention target | Enforcement |
| --- | --- | --- |
| Provider PITR | At least 15 minutes RPO | Confirm in Neon production plan/settings |
| Daily encrypted logical | 14 days | Workflow manifest plus bucket lifecycle |
| Weekly encrypted logical | 8 weeks | Bucket lifecycle or a separate scheduled retention job |
| Monthly encrypted logical | 12 months | Bucket lifecycle/legal review |
| GitHub encrypted artifact | 14 days | Workflow `retention-days` |

Weekly/monthly lifecycle rules are an operator action until the production buckets are provisioned. Backups expire unless a documented legal hold applies. Deletion access must be separate from the application runtime and protected with bucket versioning/object lock where available.

## Access and encryption

- Backup credentials are backup-job-only credentials, not web/worker credentials.
- Primary and secondary storage use separate accounts or trust boundaries.
- `BACKUP_ENCRYPTION_KEY` is a 32-byte secret with a versioned `BACKUP_ENCRYPTION_KEY_ID`; old keys remain recoverable for their retention period.
- The Windows-only pre-deployment fallback `scripts/backup/invoke-local-production-backup.ps1` keeps its key outside the repository as a current-user DPAPI blob. It is suitable for a local rollback copy, but it does not replace approved off-device key custody or a secondary-region backup.
- Storage uses TLS and server-side encryption (`AES256` or approved KMS key) in addition to client-side AES-256-GCM.
- Manifests contain no database URL, password, signed URL or session plaintext.

## Monitoring

GitHub workflow failure is the minimum alert channel. `BACKUP_ALERT_WEBHOOK_URL` adds an external sanitized alert. Operators review the latest successful `VERIFIED` manifest daily and perform an isolated restore drill at least monthly.

## Current activation gap

The code path and two-boundary replication were verified against two independent local S3-compatible servers. Production primary/secondary buckets, lifecycle policy, versioning and GitHub environment secrets are not yet operator-confirmed; the production schedule is not considered active until those controls are configured and one workflow run is restored successfully.

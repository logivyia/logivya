# Recovery Verification Report

Date: 2026-07-15. Tests used isolated localhost-only PostgreSQL/Redis/storage except the read-only production source backup. No web, worker, email or WhatsApp delivery service was pointed at the restored production data.

## Database backup and restore

- Production backup ID: `production-postgres-20260715T105046Z-79764467`
- AES-256-GCM encrypted size: 2,711,346 bytes
- SHA-256: `04534fd2a71613caaab0db183c893ada7f3b7f25c016a563e87006705d034c63`
- Archive validation: 811 entries; required tables present
- Clean PostgreSQL 17 restore duration: 4,836 ms
- Migration history: 33 applied at source; latest `20260715180000_support_ticket_priority_rank`
- Constraints: 170 validated foreign keys; no missing audited indexes

Critical restored row counts matched the exported MVCC snapshot exactly: User 15, Company 14, WhatsAppAccount 23, WhatsAppSession 13, MessageCampaign 446, MessageRecipient 1,238, SupportTicket 17 and AuditLog 46,045. Four WhatsAppAccount rows carried snapshot metadata without an encrypted snapshot row; this remains a production data-quality warning.

## Secondary-copy test

Synthetic backup `test-postgres-20260715T110520Z-b04a7dd9` was encrypted and uploaded to two independent local S3-compatible boundaries. Both stored archive and manifest objects. Both archives were 333,172 bytes and exposed identical checksum metadata `7a9e552e291f821bc58258b1bafc711aab6775ddbcaaddabba6ccad8d1e0fc8d` plus `AES-256-GCM` encryption metadata. This proves implementation compatibility, not production bucket activation.

## Redis and queue recovery

After an empty Redis start, PostgreSQL reconciliation rebuilt two recipient jobs, two pending Delete for Everyone jobs and one recurring job. It reset one stale `SENDING` recipient to `RETRYING` and one stale `PROCESSING` deletion to `PENDING`. A second reconciliation added zero jobs and reset zero claims. The worker now stops every deletion job that cannot atomically claim the database row, preventing two queue records from issuing the same provider deletion while still allowing stale work to recover after the claim timeout.

## WhatsApp snapshot restore

A synthetic registered Baileys snapshot containing two files was encrypted into WhatsAppSession, removed from disk and restored from PostgreSQL. The plaintext marker was absent from the encrypted database field, restored files matched exactly and `restoreCount` became 1. A live socket reconnect was not attempted without a designated test account.

## Worker and migration failure

An empty isolated worker started as `queue-recovery-worker-a`; after termination, a second process `queue-recovery-worker-b` replaced the Redis heartbeat. A forced PostgreSQL DDL failure stopped and rolled back its transaction, leaving no partial probe table.

## Regression and live health

The final candidate passed `npm test`, `npm run typecheck`, `npm run mobile:typecheck`, `npm run worker:typecheck`, `npm run worker:test`, `npm run lint`, `npm run build`, `npx prisma validate` and `npm audit --audit-level=low`. A PostgreSQL 17 database reached 35/35 applied migrations with zero incomplete rows, and `prisma migrate diff` returned `No difference detected`. The production build compiled 187 routes and the dependency audit reported zero vulnerabilities.

The final read-only production migration-safety audit reported zero failed checks and zero warnings across company ownership, WhatsApp account/group ownership, duplicate account JIDs, category assignments and message-recipient tenant scope.

Read-only checks followed the canonical redirect to `https://www.logivya.com` and returned HTTP 200 for web, database, Redis, queue, worker and WhatsApp health endpoints. The observed web source commit was `cae4004b0f5ae0918bfbb8095ee0404bb6cfb6f9`; the worker heartbeat was fresh and carried marker `WHATSAPP_CONTACT_DIRECTORY_V14_TRANSACTION_SAFE_BATCHING`. Queue health also reported 68 historical failed sync jobs and 2 failed message jobs, which require operational triage even though all queue services were reachable.

## Not yet proven

- Production primary/secondary bucket provisioning, versioning, lifecycle and backup workflow success
- Neon PITR retention and Upstash backup settings
- Live WhatsApp reconnect after worker restart with a designated test account
- Complete production WhatsApp snapshot coverage or durable worker storage; the live health response still reports `sessionStorage: local-filesystem`
- Customer object-file restore because no active private object-storage implementation exists
- Supervised production Vercel/Render rollback
- GitHub CI success after these local workflow changes are committed and pushed
- Deployment of migrations `20260715190000_durable_queue_recovery` and `20260715191000_schema_drift_reconciliation` plus the candidate worker/web code

# Disaster Recovery Overview

## Authority and dependencies

PostgreSQL is the durable source for identity, tenancy, billing, support, WhatsApp metadata and encrypted snapshots, groups, contacts, campaigns, recipients, message keys and scheduling intent. Redis stores queues, locks, cache and heartbeat; it is recoverable from PostgreSQL intent. Render disk is a session cache/fallback, not the only backup.

Recovery order:

1. Secrets and encryption-key custody
2. PostgreSQL/PITR or verified logical restore
3. Object/release artifacts where applicable
4. Redis and durable queue reconciliation
5. Web/API
6. Worker and designated-account session recovery
7. Notifications and normal traffic

## Objectives

PostgreSQL target RPO is 15 minutes with confirmed Neon PITR and worst-case 24 hours from daily logical backup; target RTO is 60 minutes. WhatsApp snapshots target near-real-time RPO and 30-minute RTO. Redis has no byte-for-byte RPO; durable queue intent targets 15-minute RPO and 30-minute RTO. Full targets are in `docs/recovery-objectives.md`.

## Incident classes

- Database corruption/deletion: freeze writes, restore in isolation, validate, then promote.
- Redis loss: provision Redis, start one worker, reconcile durable queues, verify idempotency, then scale.
- Worker loss: restart compatible image, verify heartbeat/snapshots/locks, reconcile queues.
- Web/API regression: Vercel rollback to a schema-compatible deployment.
- Credential compromise: contain, restore service, then rotate according to key lineage and retention needs.

## Known gaps

Production Neon PITR retention and Upstash backup switches require operator confirmation. Production S3-compatible primary/secondary backup boundaries and lifecycle policies are not configured in repository-visible state. There is no active private binary object-storage adapter, so no customer-object restore was applicable. A real WhatsApp reconnect drill requires a designated test account and approved worker secret access.

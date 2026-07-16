# Monitoring Architecture

LOGIVYA separates logs, metrics, health, alerts, incidents and audit evidence. The application does not depend on an external monitoring provider to serve customers. Provider export failure changes monitoring evidence to `UNKNOWN`; it does not block login, WhatsApp recovery, message delivery, support or subscription checks.

## Runtime flow

1. `/api/health/live` proves only that the Next.js process can answer.
2. `/api/health/ready` performs bounded Tier-0 probes for PostgreSQL, Redis, BullMQ and the worker heartbeat.
3. `getSystemHealthSnapshot` combines authoritative database aggregates, Redis/queue evidence, worker heartbeat, provider configuration and the latest backup workflow.
4. `/api/cron/monitoring` reconciles actionable Tier-0 failures into deduplicated `OperationalAlert` and `IncidentLog` records. Vercel Hobby invokes it daily as a safety net; an external scheduler can invoke the same authenticated endpoint every five minutes when higher-frequency monitoring is configured.
5. High/critical operational alerts create or reopen one stable incident and notify the platform owner through the existing notification/push pipeline.
6. `/api/admin/system/health` and `/api/health/dependencies` expose detailed evidence only after platform-admin or internal-token authorization.
7. Web, mobile web and Android consume the same administrator contract. Incident mutations are authorization checked and audit logged.

## Data sources

- PostgreSQL: bounded `SELECT 1`, `pg_stat_activity`, Prisma migration state and indexed aggregate counts.
- Redis: `PING`, bounded INFO sections and `DBSIZE`; values never include raw keys.
- BullMQ: job counts, oldest waiting age, recent completion/failure samples, duration percentiles and worker count.
- Worker: Redis TTL heartbeat with service, environment, release, queues, start time, current work and capacity.
- WhatsApp: aggregate account states, restores and delivery outcomes. Phone numbers, session data and account labels are excluded.
- Support/email/push: database outbox and delivery logs. Message/email bodies are excluded.
- Backup: latest GitHub Actions `database-backup.yml` run, cached for ten minutes. Provider failure remains `UNKNOWN`.
- Deployment: API and worker release evidence; a mismatch is `DEGRADED`.

## Cost and failure boundaries

Health queries use indexed windows and capped BullMQ samples. Global metrics do not label users, companies, contacts, groups, campaigns or messages. Queue snapshots are cached; stale snapshots are never reported healthy. Monitoring writes are limited to actionable incidents, deduplicated alerts and operator actions.

## Known provider gaps

Provider-native database storage/PITR, Redis quota, push delivery receipts, Android crash-rate ingestion, TLS/domain expiry and multi-region uptime are not available through configured credentials. Their state must remain `UNKNOWN` until the documented integrations are enabled. This is intentional and preferable to decorative green status.

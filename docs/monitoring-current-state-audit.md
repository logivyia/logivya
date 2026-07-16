# Monitoring Current-State Audit

Audit date: 2026-07-16. Baseline commit: `7ae537418a9c1476ae20bf36b02a2a58ab9c43b2`.

## Executive finding

LOGIVYA already has useful privacy-safe logs, audit/security events, mobile Sentry integration, BullMQ queues, a Redis worker heartbeat and several health routes. The mechanisms are not yet one monitoring system. Public routes expose internal details, health states are inconsistent, the WhatsApp route can report healthy while accounts are failed, queue freshness is ambiguous, and the administrator health page is mostly a placeholder. No second monitoring provider is required for this phase; the safe path is to consolidate these existing signals behind one contract.

## Existing mechanisms

| Mechanism | Classification | Decision |
|---|---|---|
| Structured server/worker logger and request correlation | Working and retained | Reuse; monitoring must not replace logs. |
| `SecurityEvent`, `AuditLog`, `OperationalAlert` | Working but incomplete | Retain; connect high-severity alerts to incidents and health views. |
| React Native Sentry wrapper | Working but environment-dependent | Retain; DSN and source-map upload remain deployment configuration. |
| Web error boundaries and `/api/observability/client-events` | Working and retained | Reuse for release-error comparison. |
| `/api/health` | Unsafe | It publishes release and commit data; reduce to minimal liveness. |
| `/api/health/db` and `/redis` | Unsafe/incomplete | They are public; Redis returns raw errors. Keep compatibility while redacting details. |
| `/api/health/queue` and `/worker` | Unsafe | They expose queue topology, worker IDs, commits and cache internals without authorization. Detailed data moves to the admin contract. |
| `/api/health/whatsapp` | Misleading | Database query success is treated as WhatsApp health even with failed/auth-required accounts. Replace with worker, queue and aggregate-delivery evidence. |
| BullMQ cached queue health | Working but incomplete | Retain and add stale-state semantics, oldest-job age, worker count, throughput and durations. |
| Redis worker heartbeat | Working but incomplete | Retain and add service, environment, release, queues, start time, jobs, capacity and state. |
| `/api/admin/system/health` | Placeholder-only | It infers worker health from active job count and checks provider configuration instead of dependency health. Replace with authoritative aggregation. |
| `/api/admin/metrics` | Working but incomplete | Retain business/security counters; add focused operational summaries in System Health. |
| `IncidentLog` | Working but incomplete | Retain the backward-compatible table and store incident workflow metadata without a destructive migration. |
| Render `healthCheckPath: /` | Working but incomplete | Worker process liveness exists, but response contains unnecessary timestamp/service data and does not prove queue consumption. Heartbeat/readiness covers consumption. |
| Vercel crons | Working but incomplete | Support/invitation jobs exist; add bounded monitoring reconciliation. |
| Backup workflow | Not alerting correctly | The latest scheduled run failed because required GitHub secrets were absent. Monitoring must report `UNKNOWN`/`UNAVAILABLE`, never fake green. |
| Email delivery log/outbox | Working but incomplete | Retain; add template input validation and failure/backlog health. |
| Push tokens/notifications | Working but incomplete | Token presence is not delivery proof; report configuration/observability gaps as `UNKNOWN`. |
| Web/Android admin health views | Placeholder/incomplete | Replace web cards and extend the existing mobile admin module with real services, incidents and authorized actions. |

## Provider and reachability audit

- Vercel hosts the Next.js application. Native provider observability is external to the repository and no API credential is configured for ingestion.
- Render hosts `logivya-whatsapp-worker` with a process liveness endpoint. Redis heartbeat is the authoritative cross-platform worker signal.
- PostgreSQL and Redis provider dashboards are not imported into LOGIVYA. Bounded runtime probes are available; storage, replication/PITR and provider quota data remain `UNKNOWN` unless a provider integration is configured.
- No external uptime, TLS, DNS or domain-expiry provider is configured in repository state. The synthetic-monitoring document defines the required checks without pretending they are active.
- Mobile Sentry code exists. `EXPO_PUBLIC_SENTRY_DSN` and upload credentials determine whether production events are actually exported.

## Immediate risks

1. Public operational endpoints disclose internals.
2. Stale queue snapshots can appear healthy.
3. An idle queue is incorrectly interpreted as an idle worker.
4. WhatsApp account failures are not separated from worker/platform health.
5. Backup freshness cannot be proven from application state.
6. Incident acknowledgment and resolution have no operational API.
7. Email templates can fall back to placeholder content instead of rejecting missing mandatory variables.

## Consolidation decision

The implementation uses one internal health contract with `HEALTHY`, `DEGRADED`, `UNAVAILABLE`, `UNKNOWN` and `MAINTENANCE`. Public routes expose only a minimal status. Detailed probes, metrics, alerts and incidents are platform-admin or cron protected. Missing/stale evidence remains `UNKNOWN`; monitoring failure is never allowed to block login, messaging, support creation or subscription checks.

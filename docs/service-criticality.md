# Service Criticality

| Service | Tier | Owner | Purpose and dependencies | Health | Primary alert | RPO / RTO | Runbook |
|---|---:|---|---|---|---|---|---|
| Backend API | 0 | Platform | Authentication and all customer APIs; PostgreSQL | `/api/health/live`, `/ready` | API unavailable | 0 / 15 min | `api-unavailable.md` |
| PostgreSQL | 0 | Platform/SRE | Durable business, session and audit data | Readiness + admin dependency probe | Connection/latency/migration | Backup RPO 24 h; RTO 4 h | `database-unavailable.md` |
| Redis | 0 | Platform/SRE | BullMQ, locks, rate limits and heartbeat | Readiness + admin dependency probe | Unavailable, latency, eviction | Queue reconstruction from DB; RTO 30 min | `redis-unavailable.md` |
| Queue infrastructure | 0 | Messaging | Durable delivery orchestration; Redis + DB | Admin queue metrics | Missing consumer or aged backlog | DB is durable source; RTO 30 min | `queue-backlog.md` |
| WhatsApp/message worker | 0 | Messaging | Pair, restore, synchronize, send and delete | Redis heartbeat + queue workers | Missing/stale heartbeat | Session snapshot RPO minutes; RTO 30 min | `worker-heartbeat-missing.md` |
| WhatsApp operations | 0 | Messaging | Customer account availability and aggregate delivery | Admin System Health | Worker unavailable or delivery spike | Session snapshots; RTO 30 min | `whatsapp-reconnect-failure.md` |
| Authentication | 0 | Security | Registration, login, session and 2FA | Aggregate login evidence | Broad failure spike | 0 / 30 min | `security-incident.md` |
| Subscription entitlement | 0 | Billing | Plan and seat authorization | Open entitlement alerts | Paid-user entitlement error | 0 / 30 min | `api-unavailable.md` |
| Scheduler | 1 | Messaging | Scheduled and recurring campaigns | Overdue indexed query | Overdue campaign threshold | DB source; RTO 60 min | `queue-backlog.md` |
| Contact/group sync | 1 | Messaging | Address book and group hydration | Sync-run aggregates | Stale or repeated failed runs | Reconstructable; RTO 4 h | `whatsapp-reconnect-failure.md` |
| Support | 1 | Customer Operations | Ticket persistence and reply delivery | Ticket/outbox aggregates | Notification backlog | DB RPO 24 h; RTO 4 h | `support-flow-failure.md` |
| Email | 1 | Customer Operations | Transactional notifications | Provider config + delivery log | Missing variables/failure spike | Outbox retry; RTO 4 h | `email-delivery-failure.md` |
| Push | 1 | Mobile | User/admin notifications | Token counts; receipts missing | Provider evidence unknown | In-app notification retained | `support-flow-failure.md` |
| Backups | 1 | SRE | Recoverability | Latest workflow run | Failed or older than 36 h | RPO 24 h; RTO 4 h | `backup-verification-failure.md` |
| Deployment health | 1 | Release | API/worker release compatibility | Release comparison | Mismatch/bad release | Rollback target last verified release | `bad-deployment.md` |
| Analytics/reporting | 2 | Product | Reconstructable aggregates | Business metrics | Sustained aggregation failure | Rebuild from source; RTO 24 h | `api-unavailable.md` |

Tier 0 pages immediately for unavailable service. Tier 1 alerts during the response window. Tier 2 normally creates a work item unless customer impact escalates severity.

# Metric Catalog

Metrics are currently calculated from bounded operational sources for the System Health API. External time-series export is not enabled. Allowed labels are limited to environment, service, queue, operation, result, safe error code, release, provider, target type and schedule type.

| Domain | Metric | Source/window | Purpose | Retention |
|---|---|---|---|---|
| API | liveness/readiness state | Runtime/current | Availability | Uptime provider when configured |
| Database | query latency, total/active/idle/waiting connections, failed migrations | `pg_stat_activity`, current | Latency/capacity/schema safety | Snapshot only |
| Redis | command latency, memory, max memory, clients, evictions, rejected connections, key count | Redis INFO/current | Dependency and capacity | Snapshot only |
| Queue | waiting/active/delayed/failed, oldest wait, workers, retrying | BullMQ/current | Backlog and consumer health | Internal cache 2–10 min |
| Queue | completed/failed, throughput, average/P95/P99 duration, completion rate | Last 100 jobs / 15 min | Processing health | Snapshot only |
| Worker | heartbeat age, current jobs, capacity, state | Redis TTL / current | Consumer liveness | TTL 90 s |
| WhatsApp | connected/connecting/reconnect-required/failed counts | Current aggregate | Account estate | Snapshot only |
| Messaging | sent/failed targets and failure rate | 24 h | Customer delivery | Source rows follow product retention |
| Scheduler | overdue scheduled/recurring campaigns | 5 min grace | Missed work | Snapshot only |
| Dashboard | synchronized WhatsApp groups | Current `WhatsAppGroup` rows where `companyId` and `userId` match the session, `isArchived=false`, `canSend=true`, and the owning account is accessible | User-owned sendable group count | Snapshot only |
| Dashboard | Professional contacts | Current active `Contact` rows where `companyId` and `userId` match the session, the account is accessible, and `source != PHONE_FALLBACK`; returned only when `contactMessaging=true` | Entitled contact directory size | Snapshot only |
| Sync | completed/failed/stale runs, discovered/persisted/named/fallback | 24 h | Directory quality | Source rows follow operational retention |
| Support | tickets, waiting-admin backlog, stale/failed outbox | Current and 24 h | End-to-end support | Source rows follow support policy |
| Email | sent/failed/stale pending and failure rate | 24 h | Transactional delivery | `EmailDeliveryLog` policy |
| Auth | attempts/failures/failure rate | 1 h | Broad auth incidents | Login-attempt retention |
| Subscription | active/expired and open entitlement alerts | Current | Access reliability | Source records retained by billing policy |
| Backup | workflow status, conclusion and age | Latest GitHub run | Recoverability | GitHub workflow retention |
| Deployment | API/worker release match | Current | Bad rollout detection | Incident/release records |

No metric contains email, phone, contact name, message body, ticket body, token, session credential or customer-specific label.

## Mobile dashboard contract

`GET /api/mobile/bootstrap` returns `dashboardMetrics` as an explicit server-owned contract. Clients must render these values directly and must not derive totals from a bounded account list.

- `syncedWhatsAppGroupCount` counts groups, never group participants or contacts.
- `contactCount` is nullable and is not computed or exposed when the current subscription lacks the Professional `contactMessaging` entitlement.
- Every query is scoped by both `companyId` and `userId`; related WhatsApp accounts must also be owned by the same tenant and user.
- Archived, non-sendable, logged-out, or otherwise inaccessible account data is excluded.
- Pull-to-refresh, screen focus, and app foreground transitions reload the metric contract from the backend.

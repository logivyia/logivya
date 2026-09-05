# Alert Severity Policy

| Severity | Definition | Initial response | Examples |
|---|---|---:|---|
| SEV-1 / CRITICAL | Broad Tier-0 outage, data loss risk or active critical security incident | 5 min | DB unavailable, worker and queue unable to deliver, failed restore during incident |
| SEV-2 / HIGH | Major degradation or a Tier-0 unknown/degraded state with customer impact | 15 min | Stale worker heartbeat, aged queue backlog, high message failure rate |
| SEV-3 / MEDIUM | Tier-1 failure or contained degradation | 4 business hours | Support outbox backlog, email failure spike, backup provider evidence missing |
| SEV-4 / LOW | Informational/capacity trend requiring planned work | 2 business days | Early capacity warning or non-critical integration gap |

Alerts deduplicate by environment, service, controlled type and cooldown window. Health incidents use a stable environment/service key and reopen instead of creating repeated incidents. Queue depth alone does not alert; age, workers and throughput are evaluated together. One user account logout, one failed login or one weak security signal does not create a platform incident.

Primary destination is the platform owner's in-app notification and push pipeline. `OperationalAlert` and `IncidentLog` remain the durable destination if push/email providers fail. Critical alerts require a real runbook. Alert delivery failure never blocks customer traffic.

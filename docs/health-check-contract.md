# Health Check Contract

## States

- `HEALTHY`: current bounded evidence passes.
- `DEGRADED`: service can operate with reduced reliability or a Tier-0 dependency is unknown.
- `UNAVAILABLE`: the primary function cannot be performed safely.
- `UNKNOWN`: evidence is missing, stale or inaccessible. It must never be converted to healthy.
- `MAINTENANCE`: intentional unavailability declared by operations.

## Endpoints

| Endpoint | Access | Purpose | Response |
|---|---|---|---|
| `GET /api/health` | Public | Backward-compatible liveness | Only `{ "status": "ok" }` |
| `GET /api/health/live` | Public | Process liveness | Only status; no dependency call |
| `GET /api/health/ready` | Public | Bounded Tier-0 readiness | Only status; HTTP 503 when unavailable |
| `GET /api/health/db`, `/redis`, `/queue`, `/worker`, `/whatsapp` | Public | Legacy probes | Minimal status only |
| `GET /api/health/dependencies` | Platform admin or `x-logivya-monitoring-token` | Detailed dependency snapshot | Full safe contract |
| `GET /api/health/version` | Platform admin or internal token | Release evidence | Service, environment and release |
| `GET /api/admin/system/health` | Platform admin | Operations Center | Services, queues, incidents, alerts and capacity |

Public endpoints never include hosts, URLs, raw errors, secrets, worker IDs, commits, customer data or topology. Detailed responses use controlled error codes. All checks use `cache-control: no-store`; queue and provider sub-probes may use bounded internal caches with explicit stale state.

## Aggregation

A Tier-0 `UNAVAILABLE` state makes the platform unavailable. Tier-0 `DEGRADED`, `UNKNOWN` or `MAINTENANCE` makes the platform degraded. Tier-1 failures make the overall status degraded but do not make API readiness unavailable. Monitoring failure itself is isolated from business requests.

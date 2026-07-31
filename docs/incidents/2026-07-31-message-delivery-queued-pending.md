# Message delivery stuck in queued/pending

Date: 2026-07-31
Status: NO-GO until production worker queue health is green and a real send is verified

## Symptom

Contact and group sends can remain indefinitely as `QUEUED`/`PENDING` with zero attempts.

## Production evidence

Checks performed on 2026-07-31 showed:

- `/api/health`: HTTP 200
- `/api/health/queue`: HTTP 503, unavailable
- `/api/health/worker`: HTTP 200, degraded
- `/api/health/whatsapp`: HTTP 200, degraded

The Vercel production environment exposed the provisioned Upstash Redis connection as `KV_URL`, while the application queue client only read `REDIS_URL`. The worker blueprint uses `REDIS_URL`. This naming mismatch allowed the web API to appear healthy even though its delivery queue path was unavailable.

## Code failure mode

The worker also resolved the recipient target before claiming the durable recipient row. If a target was missing, the job returned without changing `PENDING`, producing a permanently misleading history entry.

## Remediation

- Fail closed before campaign creation when Redis, the queue, or its worker is unavailable.
- Claim the durable recipient before target validation.
- Convert permanent target and ownership errors to terminal `FAILED` state.
- Centralize campaign delivery aggregates.
- Provide a dry-run-first repair command for stale recipients.
- Configure API and worker deployments with the same Redis endpoint.
- Accept the Vercel `KV_URL` compatibility alias while keeping `REDIS_URL` canonical.
- Abort stale-record repair without mutations when no active queue consumer is proven.

## Release gate

Do not create a store artifact until the shared backend is deployed, queue health is green, stale records are repaired, and a real send reaches a terminal delivery state.

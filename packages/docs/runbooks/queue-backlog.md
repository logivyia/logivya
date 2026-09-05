# Queue Backlog

**Symptoms:** Oldest waiting job exceeds 5 minutes, waiting work has zero consumers, throughput falls, retries or delayed jobs rise. **Impact:** Messages, sync or schedules arrive late.

1. Identify the queue, oldest age, active count, worker count, throughput and P95/P99 duration. Queue depth alone is not enough.
2. Check worker heartbeat and Redis before retrying anything. Inspect controlled job names/error codes, never message bodies or recipients.
3. If workers are healthy but saturated, scale within provider/WhatsApp limits. If jobs are stuck, use durable reconciliation; do not bulk clone or delete jobs.
4. Preserve idempotency and per-account locks. Roll back a release if processing duration/failure rose immediately after deployment.
5. Verify backlog age decreases, completion rate recovers, no duplicate sends occur and scheduled jobs execute once.
6. Escalate aged Tier-0 queues as SEV-2; create SEV-1 if broad delivery stops.

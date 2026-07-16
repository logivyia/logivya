# Capacity Management

Review weekly and before large campaigns:

- PostgreSQL connection count, waiting connections, query latency, storage and provider limits.
- Redis memory/max memory, evictions, rejected connections, command quota and key growth.
- Queue oldest waiting age, throughput, P95/P99 duration, retries and worker count per queue.
- Worker current jobs/capacity, restart frequency and heartbeat gaps.
- Connected WhatsApp accounts and aggregate delivery volume; never create a metric series per account.
- Support/email backlog and push-provider quotas.
- Backup size, duration and restore-test duration.
- Vercel/Render concurrency, CPU, memory, request and build limits from provider dashboards.

Initial warnings: Redis memory >= 80%, any queue waiting job >= 5 minutes, no worker with waiting work, DB latency >= 500 ms, or backup age >= 36 hours. Thresholds must be tuned from measured baselines. Scaling changes require a load test, rollback condition and cost review.

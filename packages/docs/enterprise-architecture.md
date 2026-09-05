# Logivya Enterprise Architecture

Logivya is organized as a Business Communication Operating System. The WhatsApp MVP remains a vertical adapter while provider-neutral services become the stable platform core.

## Service boundaries

- **Web application:** Next.js UI, authenticated server actions, public API, and webhook ingestion.
- **Channel workers:** isolated provider sessions and synchronization for WhatsApp, Telegram, Meta, SMS, email, and API providers.
- **Queue workers:** BullMQ consumers for campaigns, messages, sync, notifications, billing, analytics, webhooks, and dead letters.
- **Platform services:** RBAC, subscription enforcement, safety policy, activity feed, API keys, and webhook delivery.
- **Billing services:** payment providers handle checkout and collections; invoice providers handle invoice issuance, cancellation, and PDF retrieval. Paid activation requires a complete country-validated billing profile.
- **Expansion services:** CRM and provider-strategy AI assistant.

Every command, repository method, queued job, metric, API key, and webhook event carries a `companyId`. Authorization is revalidated inside the handling service.

## Message execution

1. Resolve category targets and validate subscription plus RBAC.
2. Evaluate `AccountSafetyProfile` before queueing and before every send.
3. Create provider-neutral `ChannelMessage` records.
4. Enqueue recipient jobs with correlation IDs, retry policy, and priority.
5. Provider adapter sends after a randomized safety delay.
6. Persist delivery results and asynchronously aggregate analytics.
7. Emit activity feed entries and signed webhook events.

Workers must move exhausted jobs to the dead-letter queue and expose heartbeat, queue-depth, latency, error-rate, and throughput metrics.

## Deployment

- Vercel: Next.js frontend and lightweight route handlers.
- Docker/Kubernetes: channel sessions, BullMQ workers, webhook dispatcher, and long-running services.
- PostgreSQL: transactional tenant data.
- Redis: queues, locks, rate limits, and ephemeral presence.
- Cloudflare R2: media; Cloudflare WAF, DNS, SSL, and edge rate limiting.
- Sentry: errors and traces; Prometheus/Grafana: metrics and worker health.

Kubernetes workloads should separate each worker queue so replicas can scale from queue depth. Provider session workers require graceful shutdown and distributed locking to ensure one active owner per channel session.

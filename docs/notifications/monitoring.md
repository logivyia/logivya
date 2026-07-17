# Notification Monitoring

Health checks cover database access, queue backlog, oldest pending age, unresolved dead letters, provider configuration, enabled-device counts, recent webhook activity and notification-worker heartbeat.

The selected processor writes a Redis heartbeat containing processor mode, worker ID, status, release marker and timestamp. `NOTIFICATION_PROCESSING_MODE=worker` expects a continuously refreshed heartbeat. `NOTIFICATION_PROCESSING_MODE=cron` accepts the scheduled Vercel cron heartbeat for the configured daily window. Production health is degraded when the selected processor heartbeat is missing, stale, unhealthy or belongs to the wrong mode.

Cron mode is the no-new-service-cost fallback. It preserves durable outbox retries and monitoring, but its retry latency follows the cron schedule. Use the standalone worker mode when near-real-time external delivery and retries are required.

Alerts should trigger on sustained backlog, stale worker, delivery-failure ratio, dead-letter growth, invalid-token spikes, bounce/complaint spikes and missing provider configuration. Dashboards must use real counts and show `unconfigured` instead of fake zeroes.

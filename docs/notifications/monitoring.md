# Notification Monitoring

Health checks cover database access, queue backlog, oldest pending age, unresolved dead letters, provider configuration, enabled-device counts, recent webhook activity and notification-worker heartbeat.

The standalone worker writes a Redis heartbeat containing worker ID, status, release marker and timestamp. Production health is degraded when `NOTIFICATION_WORKER_REQUIRED=true` and the heartbeat is missing or stale.

Alerts should trigger on sustained backlog, stale worker, delivery-failure ratio, dead-letter growth, invalid-token spikes, bounce/complaint spikes and missing provider configuration. Dashboards must use real counts and show `unconfigured` instead of fake zeroes.

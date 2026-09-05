# Notification Incident Runbook

1. Confirm API, database, Redis and notification-worker health.
2. Inspect backlog age, failed delivery rate and unresolved dead letters by channel.
3. Check provider status pages and credential-expiry alerts without printing secrets.
4. Verify recent deploy marker and migration status.
5. Pause high-volume announcements if the provider or queue is unhealthy.
6. Repair configuration or provider connectivity.
7. Retry only eligible dead letters with an audited reason.
8. Verify one in-app, email, Android push and Web Push test to authorized internal accounts.
9. Monitor recovery until backlog and failure rate normalize.
10. Record timeline, scope, root cause, remediation and prevention.

Do not bulk retry before fixing the cause. Do not mark provider acceptance as user delivery.

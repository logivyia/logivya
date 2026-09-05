# Notification Retention

The worker enforces retention periodically.

- Notification/provider records: `NOTIFICATION_RETENTION_DAYS`, clamped to 30-2555 days, default 365.
- Revoked device tokens: `NOTIFICATION_DEVICE_RETENTION_DAYS`, clamped to 30-365 days, default 90.
- In-app notification deletion applies to archived or expired records older than the cutoff.

Legal holds and privacy deletion workflows take precedence where applicable. Retention jobs emit counts, must be monitored, and must never delete active device registrations or unresolved evidence required by an incident.

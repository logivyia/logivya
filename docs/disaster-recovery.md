# Disaster Recovery

## Targets

- MVP: RPO 24 hours, RTO 4 hours.
- Future: RPO 15 minutes, RTO 30 minutes.

## Required operations

- Automated encrypted PostgreSQL backups with retention rotation and point-in-time recovery readiness.
- Quarterly restore tests recorded in the incident log.
- Redis queue recovery through durable job state, idempotent handlers, retries, and dead-letter inspection.
- Worker restart policies, graceful shutdown, and deployment rollback.
- Maintenance and read-only modes for controlled recovery.

Production readiness requires a documented backup owner, restore operator, escalation contacts, and evidence from the latest successful restore test.

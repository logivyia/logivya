# Backup and Disaster Recovery

The operational source of truth is now split into:

- `docs/backup-policy.md`
- `docs/restore-runbook.md`
- `docs/rollback-runbook.md`
- `docs/disaster-recovery-overview.md`
- `docs/recovery-verification-report.md`

## Targets
- Production RPO: 24 hours for standard plans, target 1 hour after managed PITR is enabled.
- Production RTO: 4 hours.
- Encrypt every backup with `BACKUP_ENCRYPTION_KEY`; store outside the primary region.

## Policy
- PostgreSQL: daily logical backup retained 14 days, weekly retained 8 weeks, monthly retained 12 months. Enable and verify provider PITR.
- Redis: treat queues as reconstructable; persist scheduled jobs and enable provider snapshots.
- WhatsApp sessions: back up encrypted session storage daily. Never store plaintext credentials.
- Files: enable object-storage versioning and lifecycle retention.

## Restore
1. Declare incident and freeze writes.
2. Select the latest clean restore point.
3. Restore database, object storage, and encrypted WhatsApp sessions into an isolated environment.
4. Run schema validation and health checks.
5. Reconcile queue jobs, rotate exposed credentials, and reopen traffic.

## Emergency Checklist
- Notify platform administrators.
- Preserve logs and evidence.
- Revoke compromised sessions/API keys.
- Validate `/api/health`, `/api/health/db`, `/api/health/redis`, and `/api/health/queue`.
- Document recovery time and data-loss window.

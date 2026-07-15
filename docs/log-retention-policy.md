# Log Retention Policy

No legal retention period is hardcoded as a business decision.

## Implemented controls

- `SECURITY_EVENT_RETENTION_DAYS` and `OPERATIONAL_ALERT_RETENTION_DAYS` set future eligibility dates only when valid explicit values are configured.
- `/api/cron/observability-retention` requires `CRON_SECRET`.
- Without `LOG_RETENTION_ENFORCEMENT=true`, the cron is dry-run only.
- Only resolved/dismissed security events and alerts whose `retainedUntil` has elapsed may be removed.
- Immutable audit events are excluded from automated deletion.
- Provider-side operational log retention must be configured separately in Vercel and Render.

## Decisions requiring approval

Legal/business approval is required for security retention length, audit/financial retention, full-IP exceptions, processor region, data-subject request handling, legal holds, and archive/export retention. Until approval, enforcement stays false.

## Deletion and legal hold

Open investigations are not eligible. A future legal-hold implementation must supersede deletion eligibility. Data-subject requests must be reviewed against security, financial, contractual, and legal-retention exceptions before anonymization or deletion.

## Operational procedure

Run the cron in dry-run, review counts, obtain written approval, back up the database, enable enforcement, run once, verify counts and audit evidence, then schedule it. Never update `retainedUntil` in bulk without a migration safety report.

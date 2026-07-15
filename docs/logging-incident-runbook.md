# Logging Incident Runbook

## Secret or personal-data exposure

1. Stop the source without deleting evidence.
2. Restrict log access and pause exports.
3. Identify fields, services, environments, time window, processors, and readers.
4. Rotate exposed credentials immediately when a secret may be valid.
5. Preserve an access-controlled incident record; do not copy leaked values into tickets or chat.
6. Follow legal/security notification assessment.
7. Purge through approved provider/database procedures only after preservation and legal-hold review.
8. Add a canary regression and redaction-key test.

## Missing logs

Check `LOG_LEVEL`, service/environment metadata, provider ingestion, stdout/stderr collection, deployment ID, rate limits, and platform retention. Audit/security database writes are separate from operational transport. Do not increase production to DEBUG before estimating volume and privacy impact.

## Correlation failure

Confirm proxy response headers, mobile observability headers, queue payload correlation ID, worker event context, and support/campaign metadata. Invalid client IDs must be replaced, not trusted.

## Alert storm

Inspect dedupe type/service/environment/window and occurrence count. Increase thresholds only after validating real impact. Never suppress CRITICAL events globally. Resolve or dismiss with an investigation note.

## Retention failure

Keep enforcement false, run dry-run, inspect eligible counts, verify backup, confirm no audit-log delete path, and review the failed transaction. Retention is transactional for eligible security events/alerts.

## Closeout

Record root cause, affected releases, exposure scope, actions, owner, timeline, tests, remaining risk, and policy changes. Verify `test:observability`, stable core, build, and provider dashboards.

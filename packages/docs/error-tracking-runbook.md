# Error Tracking Runbook

## Triage

1. Identify environment, service, release, deployment, app version, and Android version code.
2. Start from the error digest, request ID, correlation ID, job ID, campaign ID, account ID, or ticket ID.
3. Compare the first occurrence with deployment history.
4. Check deduplicated `OperationalAlert`, worker heartbeat, queue health, database, Redis, and provider health.
5. Confirm impact across Android, mobile web, and desktop web before changing stable core.

## Web

Server errors are captured by `src/instrumentation.ts`. Route/global boundaries never display raw messages. Browser reports accept only digest, error class, source, route path, platform, and version. Query strings and user content are excluded.

## Android

Sentry is disabled until a DSN is configured. When enabled it uses environment/release/dist, 5% production trace sampling, `sendDefaultPii=false`, internal user ID only, and shared event redaction. Confirm processor agreement, region, retention, and source-map access before enabling.

## Safe evidence

Never request passwords, MFA codes, tokens, QR/pairing codes, WhatsApp credentials, complete contact/group lists, or customer message bodies. Use internal IDs, timestamps, status/error codes, and correlation references.

## Escalation

CRITICAL process, database, Redis, queue, backup, restore, or widespread delivery failures trigger incident management. Preserve logs and backups, freeze risky releases, use the rollback runbook, and record the decision. Logging failure itself must not trigger destructive recovery.

## Verification

After resolution, verify error rate, queue backlog, worker heartbeat, WhatsApp restore, message delivery, Delete for Everyone, support notifications, and authentication. Add a regression test using privacy-safe fixtures.

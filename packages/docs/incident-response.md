# Incident Response

1. The monitoring cron detects actionable current evidence and creates/reopens one incident.
2. The platform owner receives an in-app/push notification; the durable alert remains visible in System Health.
3. The operator acknowledges the incident with an investigation note.
4. Determine scope, affected customer functions, release, safe error code and current queue/worker evidence.
5. Use the linked runbook. Prefer reversible mitigation; never delete queues, sessions or production data as a first response.
6. Mark `INVESTIGATING`, then `MITIGATED` when impact is controlled.
7. Consider customer communication for broad or prolonged impact without exposing security or tenant data.
8. Verify recovery from fresh health evidence and business smoke tests.
9. Mark `RESOLVED` with a specific resolution note. Automatic recovery may resolve health-created incidents but must leave its timeline.
10. Create a post-incident review for SEV-1 and SEV-2.

Incident actions are platform-admin only, validated by the backend, written to the incident timeline and recorded in immutable audit logs. Reopening a resolved incident is allowed only through a new detected condition or an explicit transition.

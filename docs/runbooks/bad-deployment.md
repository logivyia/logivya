# Bad Deployment

**Symptoms:** API/worker releases differ beyond rollout, errors rise after deploy, readiness fails, or a stable-core regression appears. **Impact:** Varies from partial UI failure to messaging outage.

1. Identify deployed commits, start time, changed services and error-rate delta. A temporary release mismatch during controlled rollout is observed, not immediately destructive.
2. Stop further rollout. Run the smallest safe smoke checks for auth, current user, queues, worker heartbeat and affected feature.
3. Roll back to the last verified compatible web/worker/database release. Do not roll back a migration destructively; use the migration safety runbook.
4. Preserve WhatsApp sessions, durable queue rows and backward-compatible API contracts.
5. Verify login, session restore, send, history, Delete for Everyone, support, subscription and admin access as appropriate.
6. Observe for 30 minutes and document why release gates did not catch the regression.

# API Unavailable

**Symptoms:** Liveness fails, readiness is 503, broad login/API failures, or Vercel error rate rises. **Impact:** Customers cannot use platform APIs; background worker may continue independently.

1. Check Vercel deployment/region status, `/api/health/live`, then `/ready`. Do not use dependency routes publicly.
2. In System Health inspect PostgreSQL, Redis and release evidence. Correlate `web.request.unhandled_error` by request/correlation ID without copying private payloads.
3. If only the latest release is failing, stop rollout and use the verified rollback procedure. If a dependency is unavailable, follow its runbook.
4. Do not disable authentication, authorization, CSRF or tenant guards as mitigation.
5. Escalate immediately for Tier-0 broad outage. Verify login, current user, support read, message history and health after recovery.
6. Observe for 30 minutes, resolve with evidence and create a SEV-1/2 review including regression tests.

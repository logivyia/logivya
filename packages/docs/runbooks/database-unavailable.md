# Database Unavailable

**Symptoms:** `database` is unavailable, `P1001/P1002/P2024`, query latency above 2 seconds, waiting connections or incomplete migration. **Impact:** API, auth, subscription and durable queues cannot operate safely.

1. Confirm provider status, connection/pool limits, waiting sessions and recent deployment/migration. Use bounded provider queries; never run table scans during the incident.
2. Freeze schema changes. Check `_prisma_migrations`, lock waits and connection saturation. Do not run `db push`, destructive migration or manual deletes.
3. For pool exhaustion, reduce non-critical concurrency and identify the query category from privacy-safe logs. For bad release/migration, follow rollback and migration-failure procedures.
4. Restore only under the restore runbook with incident commander, backup checksum and isolated verification. Never restore over production in place.
5. Escalate as SEV-1 when unavailable or data integrity is at risk. Verify auth, subscriptions, ticket persistence, durable queue reconciliation and row-count integrity.
6. Record latency, pool evidence, migration state and corrective indexes/tests in the review.

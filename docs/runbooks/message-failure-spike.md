# Message Failure Spike

**Symptoms:** Aggregate terminal failure rate >= 20% with at least 10 outcomes, final-attempt alerts, or campaigns become partial/failed. **Impact:** Messages do not reach intended groups/contacts.

1. Segment by safe target/schedule type and error code, not customer ID. Check queue age, worker heartbeat, WhatsApp state and release.
2. Distinguish recoverable reconnect/timeouts from permanent auth/provider rejection. Recoverable work must remain retrying within the stable-core policy.
3. Stop a bad rollout or reduce concurrency only with evidence. Never bypass ownership, subscription, idempotency or account locks.
4. Verify no duplicate sends, correct recipient state, history correlation and campaign aggregate counts.
5. Run designated account consecutive-send and Delete for Everyone tests after mitigation.
6. Escalate broad delivery loss as SEV-1; include failure classification and retry effectiveness in review.

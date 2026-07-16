# Backup Verification Failure

**Symptoms:** Latest backup workflow failed, is older than 36 hours, checksum/upload verification failed, or status is unknown. **Impact:** Recovery-point objective is at risk; customer traffic may remain healthy.

1. Inspect GitHub workflow conclusion and step logs. Confirm `DATABASE_URL`, encryption key and primary/secondary storage secrets exist without revealing values.
2. Do not weaken encryption, dual-storage or verification requirements to make the workflow green.
3. Run a controlled backup after configuration repair, verify checksums and both storage copies, then perform an isolated restore drill when required.
4. Never commit dumps, keys or signed storage URLs. Delete local temporary artifacts through the backup script lifecycle.
5. Escalate immediately if no valid backup exists inside RPO or a production data incident is active.
6. Resolve only after successful backup and verification evidence; record restore test, RPO/RTO and remaining provider risk.

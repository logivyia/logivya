# Worker Heartbeat Missing

**Symptoms:** Heartbeat age exceeds 60 seconds, disappears after TTL, reports stopped/degraded, or queues have no worker. **Impact:** WhatsApp pairing, restore, sync, send and delete work may stop.

1. Compare Render process state with Redis heartbeat; process state alone is not proof. Check worker release, queues, current jobs and capacity.
2. Inspect `worker.process.*`, `worker.queue.*` and fatal operational alerts. Confirm Redis and DB before restart.
3. Restart one worker instance only after preserving session volume and environment parity. Avoid a reconnect storm; let exponential recovery run.
4. Roll back if heartbeat loss follows a release. Never clear WhatsApp sessions or force user re-pairing for a recoverable worker failure.
5. Verify fresh heartbeat, queue consumers, session restore, connected state, one real test-account send and Delete for Everyone.
6. Escalate as SEV-1 when all message processing stops; document crash/restart cause and leak checks.

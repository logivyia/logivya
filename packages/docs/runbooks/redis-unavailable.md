# Redis Unavailable

**Symptoms:** Redis probe fails, rejected connections/evictions rise, queue metrics become unknown, locks or rate limits error. **Impact:** Queue processing, worker heartbeat, distributed locks and rate limiting degrade.

1. Check provider status, memory, command quota, evictions and TLS/connectivity. Never log the Redis URL or raw keys.
2. Confirm PostgreSQL remains healthy. Message/campaign rows are the durable reconstruction source; do not delete them.
3. Pause non-essential producers only if backlog cannot be bounded. Preserve WhatsApp account locks and stable-core retry semantics.
4. After Redis recovery, run durable queue reconciliation and verify one job per recipient, worker heartbeat and no cross-tenant leakage.
5. Escalate as SEV-1 when message delivery cannot progress. Verify login rate limiting, message send, scheduling, Delete for Everyone and support delivery.
6. Add capacity/quota action if memory or command limits caused the event.

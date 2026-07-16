# WhatsApp Reconnect Failure

**Symptoms:** Worker is healthy but reconnect-required/failed accounts rise, restore failures repeat, or aggregate delivery failure exceeds threshold. **Impact:** Affected customers cannot send or synchronize.

1. Separate platform worker health from individual `AUTH_REQUIRED/LOGGED_OUT` account state. A revoked customer session is not a platform outage.
2. Check encrypted snapshot presence, restore/reconnect safe error code, account lock and worker release. Never inspect or log credentials/session data.
3. Allow automatic restore and exponential reconnect. Do not generate repeated pairing codes or overwrite active pairing state.
4. For broad regression after release, roll back worker code while preserving database/session compatibility. User action is last resort for explicit auth revocation only.
5. Verify restore, stable connected state, owned groups/contacts, send, history and Delete for Everyone on designated accounts.
6. Escalate broad failures as SEV-1/2; test tenant isolation before resolving.

# Retry Policy

Retryable provider failures return the outbox row to `QUEUED` with exponential delay and jitter. A row has a bounded `maxAttempts` value, normally five. Permanent failures or exhausted attempts become `DEAD_LETTERED`.

Worker leases recover abandoned work after process restarts. Idempotency and unique dedupe keys prevent duplicate recipient/channel deliveries. Administrator retry resets the selected outbox attempt counter only after an authorized, audited resolution reason.

Provider acceptance is not final delivery. Expo receipts and signed provider webhooks reconcile final states asynchronously.

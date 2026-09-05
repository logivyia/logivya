# Transactional Outbox

`NotificationEvent`, recipient `Notification` and `NotificationOutbox` rows are created in the database transaction. This prevents a committed business-facing notification from depending on a synchronous provider call.

Workers claim eligible rows with an atomic status update and a lease. Expired processing leases return to the queue with `PROCESSING_LEASE_EXPIRED`. Scheduling uses UTC `availableAt`; expiration is checked before delivery. Audience expansion uses durable cursor state and bounded batches, so platform announcements do not load all users into one process.

The worker command is `npm run worker:notifications`. `--once` is available for controlled verification.

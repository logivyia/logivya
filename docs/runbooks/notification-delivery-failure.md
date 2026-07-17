# Notification Delivery Failure

## Signals

- `NOTIFICATION_DELIVERY_DEGRADED`
- Increasing queued or stale outbox rows
- Expired processing leases
- Unresolved notification dead letters
- Elevated email or push provider rejection rate

## Triage

1. Check `/admin/notifications` for event, delivery and dead-letter counts.
2. Confirm `CRON_SECRET` and the `/api/cron/notifications` invocation history.
3. Verify the configured email provider and Android push credentials without printing secrets.
4. Check whether failures are isolated to one provider, channel, tenant or event type.
5. Inspect privacy-safe `lastErrorCode`, correlation ID and provider message ID.

## Recovery

1. Repair the provider/configuration issue first.
2. Retry selected dead letters from the admin API with a documented reason.
3. Invoke the notification cron and confirm the outbox backlog decreases.
4. Confirm a new synthetic event reaches in-app, email and physical Android delivery as applicable.

## Safety

- Do not delete outbox or delivery rows to hide failures.
- Do not log recipient addresses, raw device tokens, webhook secrets or message bodies.
- Do not bulk replay without checking idempotency keys and recipient scope.

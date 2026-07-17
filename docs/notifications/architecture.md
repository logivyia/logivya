# Notification Architecture

Logivya uses one backend-owned notification pipeline for Web, mobile Web and Android.

```text
Domain event
  -> NotificationEvent (idempotent source)
  -> NotificationAudienceExpansion (batched recipient discovery)
  -> Notification + NotificationOutbox (same database transaction)
  -> notification worker (leased processing)
  -> IN_APP | EMAIL | ANDROID_PUSH | WEB_PUSH
  -> NotificationDelivery
  -> provider webhook or Expo receipt reconciliation
  -> retry or NotificationDeadLetter
```

`src/server/notifications/registry.ts` is the event contract. `engine.ts` owns persistence, audience expansion, channel policy, delivery, retries, dead letters and retention. Business modules must enqueue events; they must not call providers directly.

Existing support and invitation outboxes remain operational for backward compatibility. Protected WhatsApp/message paths are catalogued but not rewritten without the Stable Core authorization and regression gate.

The durable database is the source of truth. Redis is optional coordination infrastructure and loss of Redis must not lose scheduled work.

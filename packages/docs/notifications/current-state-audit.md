# Notification Platform Current-State Audit

Date: 2026-07-17

## Executive summary

Logivya already has useful notification building blocks, but they are not yet one delivery platform. In-app records, Expo push, transactional email, support outbox delivery, invitation delivery and monitoring are implemented through separate paths. The enterprise phase therefore uses an additive migration: existing API contracts remain compatible while a canonical event registry, preferences, delivery records, a durable outbox and dead letters become the source of truth for new notification flows.

The protected WhatsApp/message core is outside this phase. Existing WhatsApp and campaign notification calls are catalogued but are not rewritten until the Stable Core authorization and regression gate explicitly allow it.

## Existing components

| Area | Existing implementation | Finding |
| --- | --- | --- |
| In-app notifications | `Notification` model and web/mobile list APIs | Tenant-scoped, but only a boolean read state and no event/delivery lineage |
| Android push | Expo token registration, encrypted device ownership and canonical delivery | Provider tickets are persisted; the worker reconciles receipts and revokes `DeviceNotRegistered` tokens |
| Email | SMTP/transactional provider abstraction plus `EmailDeliveryLog` | Useful provider boundary, but templates and delivery state are not connected to notification events |
| Support | `SupportNotificationOutbox` with retry lease | Strongest existing pattern, but support-only and separate from other channels |
| Invitations | Dedicated invitation outbox | Durable but domain-specific |
| Web notification center | Header preview, full center, preferences and Web Push | Uses authenticated APIs, explicit permission and safe deep links |
| Mobile notification center | Paginated list, unread count, read state, preferences and permission education | Pull-to-refresh, infinite paging and deep-link navigation are implemented |
| Administration | Web and Android notification operations | Real event, delivery, dead-letter, template, announcement and provider data with controlled mutations |
| Monitoring | Canonical queue/provider metrics and worker heartbeat | Production degrades on a required missing/stale notification worker |

## Direct-call inventory

- `src/server/notifications/service.ts` creates an in-app record and immediately calls Expo.
- `src/server/email/service.ts` creates an email log and calls the configured provider.
- `src/server/support/notifications.ts` owns a separate support outbox.
- `src/server/team/invitation-delivery.ts` owns a separate invitation delivery path.
- Authentication, support, monitoring, admin actions, mobile feedback and a small number of protected WhatsApp/message paths call these services directly.

## Risks found

1. A database commit can succeed while an immediate push/email process dies before delivery.
2. Channel attempts cannot be correlated through one event and one idempotency key.
3. Legacy direct-call paths still require staged migration into the canonical engine.
4. Support and invitation retain domain outboxes for backward compatibility.
5. Production provider credentials, DNS authentication and physical-device evidence are external release blockers.

## Migration strategy

1. Add canonical event, preference, template, device metadata, outbox, delivery, dead-letter and provider-webhook entities.
2. Preserve the current `Notification`, `MobilePushToken`, email log and public list/read APIs.
3. Route new events through the canonical engine and expose compatible fields to existing clients.
4. Add preference and administration APIs/UI.
5. Keep support/invitation outboxes operational until their contract tests can be migrated independently.
6. Do not modify protected WhatsApp/message behavior in this phase.

## Release blockers external to source code

- Production email provider credentials and verified sender domain.
- SPF, DKIM and DMARC evidence.
- Android FCM/Expo production credentials and physical-device delivery/rotation tests.
- Provider webhook secrets and public callback configuration.
- Production database migration safety audit and migration application.
- Production deployment, queue recovery and multi-tenant smoke evidence.

These blockers prevent a truthful production-complete or AAB-ready claim until evidence is collected.

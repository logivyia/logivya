# TestFlight Acceptance Plan

Status: `EXECUTION REQUIRED ON PHYSICAL IPHONE AND IPAD`

## Distribution policy

- Start with an internal tester group only.
- Do not enable a public link or external TestFlight distribution without explicit approval.
- Do not submit to App Review or release the app from this test plan.

## Core acceptance

| Area | Test |
| --- | --- |
| Install and launch | Fresh install, cold launch, relaunch, crash recovery |
| Authentication | Register, login, invalid credentials, password reset, logout, session restore |
| Account | Workspace settings, shared access, subscription state, account deletion entry point |
| WhatsApp | Pairing, connected state, background/foreground transition, reconnect after network loss |
| Messaging | Group send, contact send, history, scheduled send, repeat send, failure state |
| Delete | Delete for Me, Delete for Everyone, history reconciliation |
| Synchronization | Groups, contacts, categories, incremental refresh, tenant isolation |
| Support | Create ticket, list own tickets, open thread, reply, status visibility |
| Notifications | Permission education, allow/deny, foreground receipt, background receipt, tap navigation |
| Privacy | Consent preferences, data request, export request, account deletion request |
| Upgrade | Install the next build over the prior TestFlight build and confirm session/data continuity |

## Failure and lifecycle matrix

- Offline launch and recovery after connectivity returns.
- API timeout and server error messaging.
- Poor network during pairing and message submission.
- App backgrounded for 1 hour, 6 hours, and overnight.
- Device restart and app relaunch.
- Notification token invalidation and re-registration.
- Logout must remove or revoke the current device push registration; this requires evidence before App Review.
- iPhone small/large layouts and iPad portrait/landscape layouts.

## Evidence

Record build ID, version/build number, device model, iOS version, tester, timestamp, result, sanitized screenshot/video, and incident reference. Never include credentials, QR codes, phone numbers, private messages, or tokens.

## Exit criteria

- No P0/P1 issue open.
- Stable-core connection, send, history, and Delete for Everyone tests pass.
- No cross-tenant or cross-user data exposure.
- Push lifecycle and logout cleanup are proven on physical devices.
- Product, privacy, subscription, and App Review account checks are approved by responsible humans.

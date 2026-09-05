# Logivya Stable WhatsApp/Message Core

Current protected baseline: Android v61 / `1.0.60`, marker `WHATSAPP_PAIRING_ACTIVE_CODE_RETRY_FIX`.

This document is a release guardrail. It exists to keep future UI/admin/language work from damaging WhatsApp connection, message delivery, group isolation, or Delete for Everyone.

## Protected Scope

The following flows are stable core:

- Login/session state required for messaging.
- WhatsApp QR pairing and phone pairing.
- WhatsApp session snapshot, database restore, reconnect and socket lifecycle.
- WhatsApp account ownership and group synchronization.
- User/company/group isolation.
- Category to group assignment when sending messages.
- Message campaign creation, queueing, worker delivery and history.
- Delete for Everyone, message key storage and delete status.
- Subscription checks required by messaging.
- Android package id, signing lineage, versionCode, versionName and device coverage.

## No-Touch Rule

Do not edit these areas for UI-only features unless the change is explicitly approved as stable-core work:

- `src/lib/whatsapp/session-manager.ts`
- `src/server/whatsapp/session-restore.ts`
- `src/server/whatsapp/account-lock.ts`
- `src/server/whatsapp/sendable-groups.ts`
- `src/server/messages/delivery-pipeline.ts`
- `src/server/messages/delete-for-everyone.ts`
- `src/server/queues/contracts.ts`
- `src/server/queues/client.ts`
- `src/server/queues/producer.ts`
- `src/worker/baileys-provider.ts`
- `src/worker/index.ts`
- Prisma WhatsApp/message/session/group/campaign schema.
- Android signing, application id, versioning and supported device config.

## Required Automated Checks

Run before any release candidate that touches stable core:

```bash
npm run test:stable-core
npm run typecheck
npm run lint
npm run build
cd apps/mobile && npm run typecheck
```

When mobile code changes, also run the Android release bundle build and signer verification.

## Core Contracts

- App logout must never clear WhatsApp sessions.
- Read-side status probes must never convert a linked account to `AUTH_REQUIRED`.
- Missing sockets with restorable credentials must schedule reconnect.
- Missing sockets without verified fatal auth loss must remain recoverable.
- Account-scoped socket operations must use the Redis account lock.
- Message send lock contention must retry, not fail permanently.
- Delete for Everyone must use the original WhatsApp message key and tenant/user/account checks.
- Message history must only show the current user/company unless the backend admin guard authorizes otherwise.
- Platform admin identity must not change message delivery authorization.

## Manual Acceptance Matrix

Before AAB release, verify on Android, mobile web and desktop web:

- Register, login, logout.
- WhatsApp QR pairing.
- WhatsApp phone pairing.
- Session restore after worker restart.
- Group synchronization, including a newly created group.
- Category creation/edit and group assignment.
- Immediate message send.
- Scheduled message send.
- Message history.
- Delete for Me.
- Delete for Everyone.
- Queue retry after temporary disconnect.
- User A cannot see User B accounts/groups/messages.
- Admin can access admin features; normal user cannot.

If any item fails, do not generate or upload the release AAB.

## Rollback

- Keep the last known good AAB and version metadata.
- Keep the previous production deployment available for rollback.
- Do not run destructive Prisma migrations as part of rollback.
- If worker deployment is unhealthy, pause new message jobs, drain current jobs if safe, and restore the last known good worker.
- If WhatsApp sessions appear stale after rollback, run the recovery worker and confirm reconnect before asking users to reconnect manually.

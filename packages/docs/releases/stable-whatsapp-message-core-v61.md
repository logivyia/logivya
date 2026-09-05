# Logivya Stable WhatsApp Message Core V61

## Baseline

- Android AAB: `logivya-v61-1.0.60-whatsapp-pairing-message-delivery.aab`
- Package: `com.logivya.mobile`
- Version code: `61`
- Version name: `1.0.60`
- Git tag: `stable-whatsapp-message-core-v61`
- Build marker: `WHATSAPP PAIRING MESSAGE DELIVERY FIX V61`
- Prompt marker alias: `WHATSAPP_PAIRING_MESSAGE_DELIVERY_FIX_V61`
- Production worker marker: `WHATSAPP_PAIRING_ACTIVE_CODE_RETRY_FIX`
- Source commit: `56a1d61cc7c92921e9d1a512695a6ceeb3b36a50`
- AAB SHA256: `7C2B07638E0E15ABE93F60513A834A07CF6BE94BAC3908FA460F8F467DF6CFD3`

## Stable Core

These capabilities are protected:

- Admin user can connect WhatsApp.
- Normal users can connect their own WhatsApp.
- Users see their own WhatsApp groups.
- Users can send messages.
- Users can delete sent messages for everyone.
- Android, web, and mobile web must remain compatible with this core.

## Protected Areas

Do not modify these areas unless the user explicitly says: "Modify LOGIVYA stable WhatsApp/message core".

- Authentication flow required for WhatsApp messaging
- WhatsApp connection, QR pairing, phone pairing
- Session snapshot and restore
- WhatsApp account ownership
- WhatsApp group synchronization
- User/group isolation
- Category/group assignment logic
- Message send pipeline
- Queue job creation for messages
- Worker message delivery logic
- Baileys socket manager and reconnect logic
- Delete for Everyone
- Message key storage
- Message history delivery state
- Subscription checks required for message sending
- Android native build config related to v61
- Environment variables used by WhatsApp, worker, and message sending

## Change Guard

Before every change, classify the request as one of:

- Stable Core Change
- Non-Core Feature Change
- UI-only Change
- Admin-only Change
- Translation-only Change
- Build-only Change

For non-core work, do not touch protected files, Prisma WhatsApp/message schema, queue delivery code, worker delivery code, or API contracts used by Android/web/mobile web for login, current user, WhatsApp accounts, WhatsApp groups, send message, Delete for Everyone, or message history.

If a future task requires touching protected core files, stop and ask for explicit confirmation before editing.

## Regression Gate

After future changes, verify the stable core:

- Login works.
- WhatsApp account still appears connected.
- Normal user sees only own groups.
- Admin groups do not leak to normal users.
- Message send still works.
- Delete for Everyone still works.
- Message history still works.
- Web build passes.
- Mobile typecheck passes.
- Android build passes if mobile code changed.

Do not produce a new AAB if these checks fail.

## AAB Rule

Future AAB files must not regress from v61 / 1.0.60. Before producing a new AAB:

- Confirm stable WhatsApp/message features still work.
- Increase `versionCode`.
- Increase `versionName` when appropriate.
- Record build marker.
- Record SHA256.
- Verify signed AAB.
- Confirm worker/deploy compatibility.

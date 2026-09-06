<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:logivya-stable-core-lock -->
# Logivya Stable Core Lock

Current stable baseline: Android `versionCode` 61, `versionName` 1.0.60, AAB `logivya-v61-1.0.60-whatsapp-pairing-message-delivery.aab`, production worker marker `WHATSAPP_PAIRING_ACTIVE_CODE_RETRY_FIX`.

Do not modify the stable WhatsApp/message core unless the user explicitly says: "Modify LOGIVYA stable WhatsApp/message core".

Protected stable core areas include authentication required for messaging, WhatsApp QR/phone pairing, session snapshot/restore, account ownership, group synchronization, user/group isolation, category/group assignment, message send queues, worker delivery, Baileys socket/reconnect logic, Delete for Everyone, message key storage, message history delivery state, subscription checks required for sending, Android native build config for v61, and WhatsApp/worker/message environment variables.

For non-core, UI-only, admin-only, translation-only, or build-only work: do not touch WhatsApp/message worker files, Prisma WhatsApp/message schema, queue delivery code, or API contracts for login/current user/WhatsApp accounts/groups/send/delete/history.

After future changes, run stable-core regression checks appropriate to the scope: login, WhatsApp connected state, user-owned groups only, no admin group leakage, message send, Delete for Everyone, message history, web build, mobile typecheck, and Android build when mobile code changes.
<!-- END:logivya-stable-core-lock -->

# Store release policy
Android builds use local Gradle only. Never run EAS Android or --platform all.
User authorized Apple App Review submission and full Google Play publication on 6 September 2026 after store visuals and native supported-language declarations are complete.

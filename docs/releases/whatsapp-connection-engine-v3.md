# WhatsApp Connection Engine V3

Version: Logivya Mobile 1.0.37 (Android 38)

## Summary

WhatsApp connection state now uses persisted database session snapshots, shared health telemetry, and queue recovery instead of treating transient socket drops as a hard disconnect.

## Operational Notes

- Run Prisma migration `20260624133000_whatsapp_connection_engine_v3` before deploying worker changes.
- Deploy web/backend API changes before or together with the WhatsApp worker.
- Restart the WhatsApp worker after deployment so it restores sessions from `WhatsAppSession.sessionDataEncrypted`.
- Mobile 1.0.37 uses build marker `WHATSAPP_CONNECTION_ENGINE_V3`.

## Validation

- Root typecheck: passed.
- WhatsApp regression guard: passed.
- WhatsApp V3 load simulation: passed for 100, 1,000, 10,000 and 100,000 accounts.
- Lint: passed.
- Web production build: passed.
- Mobile typecheck: passed.
- Android production export: passed.
- Local Android release AAB: passed.

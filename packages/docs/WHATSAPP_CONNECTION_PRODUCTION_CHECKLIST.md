# Logivya WhatsApp Connection Production Checklist

Use this checklist after deploying the web app and restarting the WhatsApp worker.

## Runtime prerequisites

- `REDIS_URL` is configured for both Vercel and the worker runtime.
- `WHATSAPP_WORKER_HEARTBEAT_KEY` is the same in Vercel and the worker runtime.
- `WHATSAPP_SESSION_ROOT` points to persistent storage on the worker runtime.
- The worker process is running `npm run worker` or the production equivalent.
- Vercel API routes do not run Baileys directly; they enqueue work and wait for worker-produced state.

## QR connection

- Open `https://www.logivya.com/accounts`.
- Click `WhatsApp hesabı ekle`.
- Select QR flow and generate a QR code.
- Verify the QR image appears within 30 seconds.
- Verify logs include `whatsapp.qr.received` and `whatsapp.qr.saved`.
- Scan the QR in WhatsApp Linked Devices.
- Verify account status changes to `CONNECTED`.
- Verify groups sync automatically after connection.

## Phone pairing

- Start a new connection attempt.
- Enter `0552...` and verify it normalizes to `90552...` server-side.
- Enter `+90 552...` and verify it normalizes to `90552...` server-side.
- Generate a phone pairing code.
- Verify logs include `whatsapp.pairing.request_started` and `whatsapp.pairing.code_generated`.
- Enter the code in WhatsApp Linked Devices > Link with phone number.
- Verify account status changes to `CONNECTED`.
- Verify failed attempts can be retried with a fresh session.

## Failure and retry

- Stop the worker and request a QR code.
- Verify the UI shows the safe worker-unreachable Turkish message.
- Restart the worker and request a new QR code.
- Verify no stale QR or stale pairing code is reused.
- Archive or delete an account and verify polling no longer exposes that account.

## Security checks

- Confirm logs never include raw QR payloads.
- Confirm logs never include raw phone numbers; only masked phone numbers are allowed.
- Confirm users cannot access accounts from another tenant/company.
- Confirm audit logs are created for QR generation, pairing code generation, connection success, and failures.

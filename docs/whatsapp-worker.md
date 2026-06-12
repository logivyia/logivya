# WhatsApp Worker

QR generation and message delivery require one independently running, long-lived worker. Vercel only runs the web/API layer and cannot host Baileys sessions.

## Required environment

- `DATABASE_URL`: Same production PostgreSQL database used by the web app.
- `REDIS_URL`: Same production Redis instance used by the web app.
- `WHATSAPP_PROVIDER=baileys`
- `WHATSAPP_WORKER_URL`: Public worker health URL, for example `https://logivya-worker.example.com/`.
- `WHATSAPP_SESSION_SECRET`: Random secret shared by the web app and worker.
- `WHATSAPP_SESSION_DIR=/var/data/sessions`
- `WHATSAPP_SESSION_VOLUME_PERSISTENT=true`
- `WORKER_HEALTH_PORT=3001`

`WHATSAPP_WORKER_URL`, `WHATSAPP_SESSION_SECRET`, `DATABASE_URL`, and `REDIS_URL` must also be configured in Vercel production.

## Local test

```powershell
docker compose up --build
```

Then open `http://localhost:3000/accounts`. The worker health endpoint is `http://localhost:3001`.

## Production requirements

Deploy `Dockerfile.worker` to a container host that supports:

1. An always-on process running `npm run worker`.
2. A persistent volume mounted at `WHATSAPP_SESSION_DIR`.
3. Outbound access to WhatsApp, PostgreSQL, and Redis.
4. A public HTTPS health URL reachable by Vercel.

Do not deploy the worker without persistent storage. Otherwise connected WhatsApp sessions will be lost after every restart.

## Verification

1. Call `/api/health/worker`; `remoteConfigured` and `remoteReachable` must both be `true`.
2. Open `/accounts` and click `WhatsApp hesabı ekle`.
3. Click `QR oluştur`; a real QR must appear within 15 seconds.
4. Scan the QR and verify that the account becomes `CONNECTED`.
5. Restart the worker and verify the account reconnects without a new QR.

# Logivya WhatsApp Connection Lock

The WhatsApp connection subsystem is production critical. It owns QR generation, phone pairing, socket lifecycle, persistent Baileys auth state, account statuses, reconnect behavior, and automatic group synchronization.

## Change Approval

Changes to the following areas require explicit approval and a full regression run:

- `src/worker/baileys-provider.ts`
- `src/worker/index.ts`
- `src/lib/whatsapp/`
- `src/server/whatsapp/`
- WhatsApp account API routes
- `prisma/schema.prisma` `AccountStatus`
- `src/components/accounts-stable-page.tsx`

Every change must run:

```bash
npm run test:whatsapp
npm run lint
npm run build
npm run db:generate
```

QR generation and phone pairing must be verified on desktop and mobile. Provider, Prisma, filesystem, and stack-trace errors must never reach the UI. Prisma enum values and account transitions must remain synchronized.

## Runtime Architecture

Vercel serves the Next.js application and API. It must not own long-running Baileys sockets or session files. The WhatsApp runtime runs as the long-lived Render worker defined in `render.yaml`, with `/var/data/sessions` mounted as persistent storage. Redis carries connection and message jobs between Vercel and the worker.

Required production variables:

- `DATABASE_URL`
- `REDIS_URL`
- `WHATSAPP_WORKER_URL` or `WORKER_HEALTH_URL`
- `WHATSAPP_SESSION_SECRET`
- `WHATSAPP_SESSION_DIR=/var/data/sessions`
- `WHATSAPP_SESSION_VOLUME_PERSISTENT=true`

Deployments must be rejected when the worker has no persistent disk. Session folders may only be manipulated through `src/lib/whatsapp/session-manager.ts`.

## State Rules

New code writes only:

`CREATED`, `PENDING_QR`, `PENDING_PAIRING`, `PAIRING_CODE_READY`, `CONNECTING`, `CONNECTED`, `RECONNECT_REQUIRED`, `FAILED`, `DISCONNECTED`, `ARCHIVED`.

Legacy values remain in the database enum only for rolling-deployment compatibility and cleanup. All new transitions go through `account-status-machine.ts`.

# Logivya Production Runbook

## Topology

- Vercel: Next.js UI, authentication, tenant-scoped APIs, campaign creation.
- Managed PostgreSQL: users, sessions, companies, accounts, groups, campaigns, reports.
- Managed Redis: BullMQ sync and message queues.
- Render Docker worker: persistent Baileys sockets, 10 GB session disk, QR events, group/contact sync, throttled sending and PostgreSQL-to-Redis queue recovery.
- Cloudflare: DNS for `logivya.com` and `www.logivya.com`.

Do not run Baileys inside Vercel Functions. WhatsApp sockets require a persistent process and filesystem.

## Required Environment Variables

Use `.env.example` as the source of truth. Set `DATABASE_URL`, `REDIS_URL`, `PASSWORD_PEPPER`, and all security keys independently in Vercel and the worker. Never commit real values.

## Database

```bash
npm install
npm run db:generate
npx prisma migrate deploy
npm run db:seed
```

The seed must run before first registration because registration assigns the `trial` plan.

## Local Development

```bash
docker compose up -d postgres redis
npm run db:generate
npx prisma migrate dev
npm run db:seed
npm run dev
npm run worker
```

## Production Deployment

```bash
# Frontend/API
vercel deploy --prod

# Worker image validation before Render deploy
docker build -f Dockerfile.worker -t logivya-worker:candidate .
```

Render receives managed PostgreSQL/Redis TLS URLs and mounts `/var/data/sessions`. PostgreSQL encrypted snapshots are authoritative recovery data; the disk is not the only backup. After Redis replacement, the worker reconciles pending/scheduled/recurring/delete jobs from PostgreSQL.

## Domain

Add `logivya.com` and `www.logivya.com` to the Vercel project. In Cloudflare, create the records Vercel requests, keep SSL mode at Full (strict), and redirect one hostname to the canonical hostname.

## QR Connection Test

1. Start Redis, PostgreSQL, web, and worker.
2. Register a new user and confirm the dashboard opens.
3. Open Accounts and select Add WhatsApp Account.
4. Enter a label. The API creates the account and queues a connect job.
5. Confirm the QR appears within a few seconds.
6. Scan it from WhatsApp > Linked devices.
7. Confirm status becomes Connected and the real phone/display name appears.
8. Open Groups and confirm real group names and counts are synchronized.
9. Test Sync, Disconnect, Reconnect, and Archive.

## Message Sending Test

1. Connect WhatsApp and synchronize groups.
2. Create a category and assign one test group.
3. Open Send Message, select the category, write a test message, and send.
4. Confirm a campaign and recipients are created.
5. Confirm BullMQ worker sends recipients sequentially with rate limiting.
6. Confirm Message History updates SENT/FAILED totals.
7. Cancel a queued campaign and confirm pending recipients are canceled.

Use a dedicated WhatsApp test account and group. Respect WhatsApp policies and recipient consent.

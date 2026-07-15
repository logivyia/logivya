# Production Inventory

Audit date: 2026-07-15. Source commit: `cae4004b0f5ae0918bfbb8095ee0404bb6cfb6f9`.

The machine-readable companion is `docs/production-inventory.json`. This inventory records observed services only; it does not invent separate API, notification-worker, scheduler-worker, or storage services.

## Application topology

| Component | Runtime and purpose | Deployment | Persistence | Critical dependencies |
| --- | --- | --- | --- | --- |
| Next.js web/API | Node 24, Next 16.2.9, desktop web, mobile web, auth and APIs | Vercel project `logivya`, production deployment `dpl_H5r8fky5CgJqSyZFumex9zXtmksP`, region `iad1` | PostgreSQL and Redis | Neon, Upstash, Render worker |
| WhatsApp worker | Node 24 Docker, BullMQ, Baileys | Render `logivya-whatsapp-worker`, starter plan, auto-deploy | Neon, Upstash, 10 GB disk at `/var/data/sessions` | Matching encryption key and source commit |
| Android client | Expo 54, React Native 0.81.5 | Google Play internal test | SecureStore plus non-secret client cache | `https://www.logivya.com` API |
| PostgreSQL | PostgreSQL 17.10, Prisma 7.8 | Neon, AWS us-east-1 hostname | Primary durable record | Encryption keys outside database |
| Redis and queues | Upstash Redis over TLS, BullMQ | Upstash managed service | Queues, locks, heartbeat and cache | PostgreSQL reconciliation for durable campaigns |
| Shared validation | Zod password policy | Bundled | None | Web/mobile contract compatibility |

## Production identifiers

- Git branch: `main`; GitHub repository: `logivyia/logivya`.
- Current production source commit: `cae4004b0f5ae0918bfbb8095ee0404bb6cfb6f9`.
- Vercel production URL: `https://www.logivya.com`; observed status `Ready`.
- Web health marker: `WHATSAPP_PAIRING_SKIP_401_SAME_CODE_REFRESH_V125`.
- Worker marker: `WHATSAPP_CONTACT_DIRECTORY_V14_TRANSACTION_SAFE_BATCHING`.
- Latest production-applied migration observed: `20260715180000_support_ticket_priority_rank`; 33 migrations, none incomplete. Repository candidates `20260715190000_durable_queue_recovery` and `20260715191000_schema_drift_reconciliation` are backward compatible and not yet production-applied.
- Current Android artifact candidate: versionCode `123`, versionName `1.0.93`, package `com.logivya.mobile`.
- AAB SHA-256: `ECF8EB76150CA7498B462D8B23F6EF16844E3B7DA6A87E1016CFD98BFD9BFAC0`.

## External services

| Service | Observed state | Backup/restore status | Limitation |
| --- | --- | --- | --- |
| Vercel | Web/API healthy | Deployment rollback available | Worker URL is not configured in the local production env; heartbeat is the current reachability proof |
| Render | Worker heartbeat fresh | Docker redeploy and persistent disk | Disk is a cache/fallback, not the only session backup |
| Neon | Database healthy, PostgreSQL 17.10 | PITR/snapshot capability is provider-plan dependent | Account retention setting was not independently verified in this audit |
| Upstash | Redis and queues healthy | Provider supports backup/restore | Current plan and daily-backup switch were not independently verified |
| DNS | Apex `76.76.21.21`; `www` CNAME to Vercel | DNS change history is provider-side | Current records do not prove Cloudflare proxying |
| Email | SMTP/provider adapters exist | Configuration is secret-manager dependent | Production provider could not be proven from repository configuration |
| Object storage | No active upload adapter | Not applicable to current URL-only attachments | `MediaFile` is a schema foundation, not proof of stored binaries |
| Payments | PAYTR/Iyzico/Stripe configuration hooks | Database records covered by PostgreSQL backup | Provider-side financial records require provider retention/export |
| Error tracking | Sentry mobile dependency exists | Provider-side retention | Production DSN/configuration not proven |

## Storage classification

- Durable: Neon PostgreSQL, including encrypted WhatsApp session snapshots.
- Durable provider cache/queue: Upstash Redis, but scheduled and recurring definitions are PostgreSQL-owned.
- Restart-surviving fallback: Render session disk. It must not be considered the authoritative backup.
- Source-controlled: public assets, templates, locale catalogs and infrastructure manifests.
- Local-only release artifacts: ignored AAB files. They need protected artifact storage; the repository is not that storage.
- Not implemented: private binary upload/object storage. Support attachments are validated URL references.

## Health evidence

On 2026-07-15, `/api/health`, `/db`, `/redis`, `/queue`, `/worker`, and `/whatsapp` returned HTTP 200. Queue counts included 68 historical sync failures and 2 historical message failures. These retained failures require alert thresholds and review; they are not evidence that current jobs are failing.

## Single points of failure

1. One Render worker service owns live Baileys sockets.
2. Worker and database must share compatible session encryption keys.
3. Backup replication code passed a two-boundary local S3 test, but no production off-provider destinations are operator-confirmed yet.
4. Android upload key and prior AABs are locally available but external custody was not proven.
5. No active object-storage implementation exists for private binary attachments.

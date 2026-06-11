# Logivya Platform

Production-oriented foundation for a multi-tenant WhatsApp communication, campaign, and CRM SaaS.

## Included

- Premium responsive App Router dashboard and all MVP workflow screens
- Dark/light/system theme and six locale dictionaries
- Tenant-scoped PostgreSQL schema with archive-safe message history
- Provider-neutral channel core, CRM foundation, AI and billing provider strategies
- Safety engine, analytics models, signed webhook delivery, API keys, and granular RBAC
- Invoice-ready company billing profiles, immutable invoice snapshots, paid-plan billing guard, and invoice provider abstraction
- Defense-in-depth security foundation: Argon2id, AES-256-GCM, tenant guards, security events, secure sessions, idempotency, hardened uploads, headers, and CI gates
- Fully reactive i18n provider with 15 supported languages, persistent selection, dynamic locale loading, English fallback, translated validation keys, and Arabic RTL
- Plan and permission seed data, queue contracts, activity feed, and structured logging
- Production authentication with revocable database sessions and automatic trial workspace creation
- Real tenant-scoped dashboard, account, group, category, campaign, and history APIs
- Worker-ready Baileys WhatsApp provider with QR persistence, group synchronization, BullMQ sending, and health endpoint

## Local setup

1. Copy `.env.example` to `.env` and configure PostgreSQL and Redis.
2. Run `npm install`.
3. Run `npm run db:generate` and `npm run db:migrate`.
4. Run `npm run db:seed`.
5. Run `npm run dev`.

## Architecture

User-facing platform pages use tenant-scoped APIs backed by PostgreSQL. Every repository query must accept and filter by `companyId`. Baileys runs only in the independent worker process; BullMQ connects Vercel APIs to that worker.

Never rely on route proxy checks as the sole authorization layer. Revalidate tenant membership and role inside every Server Action and Route Handler.

See [Enterprise Architecture](docs/enterprise-architecture.md) for the provider-neutral communication core, worker topology, safety enforcement, analytics, CRM, API, webhook, billing, observability, and deployment strategy.

See [Security Architecture](docs/security-architecture.md) and [Disaster Recovery](docs/disaster-recovery.md) for mandatory controls, incident response, and recovery targets.

See [Production Runbook](docs/production-runbook.md) and [Manual Test Checklist](docs/manual-test-checklist.md) for deployment and verification.

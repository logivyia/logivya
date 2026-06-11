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
- Interactive mock layer ready to replace with repository/service calls

## Local setup

1. Copy `.env.example` to `.env` and configure PostgreSQL and Redis.
2. Run `npm install`.
3. Run `npm run db:generate` and `npm run db:migrate`.
4. Run `npm run db:seed`.
5. Run `npm run dev`.

## Architecture

UI behavior currently uses `src/lib/mock-data.ts`. Real integrations should flow through server-side repositories and services. Every repository query must accept and filter by `companyId`. WhatsApp integrations implement `src/server/whatsapp/provider.ts`; BullMQ workers consume the contracts in `src/server/queues/contracts.ts` and can be deployed independently.

Never rely on route proxy checks as the sole authorization layer. Revalidate tenant membership and role inside every Server Action and Route Handler.

See [Enterprise Architecture](docs/enterprise-architecture.md) for the provider-neutral communication core, worker topology, safety enforcement, analytics, CRM, API, webhook, billing, observability, and deployment strategy.

See [Security Architecture](docs/security-architecture.md) and [Disaster Recovery](docs/disaster-recovery.md) for mandatory controls, incident response, and recovery targets.

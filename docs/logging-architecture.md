# Logging Architecture

## Scope

LOGIVYA uses one shared contract in `packages/logging/src/index.ts`. It is consumed by the Next.js server, queue producers, workers, web client reporting, and the Android client. It does not replace domain records such as message history or support threads.

## Data flows

1. `src/proxy.ts` validates or creates `x-request-id` and `x-correlation-id` and returns both on the response.
2. API and service code binds safe internal IDs to the structured logger in `src/server/observability/logger.ts`.
3. Production operational logs are emitted as one JSON object per line to the hosting platform log transport. Local logs are human-readable.
4. Queue payloads carry correlation IDs. Workers log queue, job, attempt, final-attempt, duration, and safe domain IDs.
5. Immutable audit events are appended to PostgreSQL `AuditLog`.
6. Security signals are appended to PostgreSQL `SecurityEvent` and can be acknowledged without changing the original event facts.
7. Deduplicated operational alerts are stored in `OperationalAlert`.
8. Android Sentry support remains configurable. Default PII is disabled and events pass through the shared redactor. The DSN is empty until processor/privacy approval.
9. Browser boundary errors send an allowlisted signal to `/api/observability/client-events`; messages, query strings, request bodies, and user content are not accepted.

## Runtime metadata

Every server log includes service, environment, Git commit, release, deployment ID, and application version when the deployment provider exposes them. Android requests add platform, version name, version code, and build marker headers.

## Reliability

Logging catches serialization and sink failures. Operational logging never blocks login, WhatsApp reconnect, support creation, or message delivery. Mandatory high-risk audit writes remain awaited. Successful high-volume target stages use DEBUG; campaign and final job outcomes use INFO/WARN/ERROR.

## OpenTelemetry readiness

The contract has trace, span, request, correlation, service, operation, and duration fields. Valid W3C `traceparent` trace IDs are read when available. No exporter is enabled until an approved processor and cost policy exist.

## Storage boundaries

- Operational logs: Vercel/Render process log transport; retention is configured at the provider.
- Audit/security/alerts: PostgreSQL.
- Mobile crash events: disabled unless `EXPO_PUBLIC_SENTRY_DSN` is approved and configured.
- Source maps: production browser source maps are not publicly enabled by Next configuration.

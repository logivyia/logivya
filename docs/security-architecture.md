# Logivya Security Architecture

Logivya uses zero-trust, defense-in-depth controls. Client data, queue jobs, webhook payloads, provider responses, and tenant resource identifiers are untrusted until validated server-side.

## Mandatory controls

- Authentication: Argon2id with optional pepper, rotating hashed sessions, expiring hashed reset/verification tokens, login attempt records, trusted devices, progressive lockouts, and MFA-ready credentials.
- Authorization: RBAC plus explicit permission checks in route handlers, services, and workers. UI visibility is never an authorization control.
- Tenant isolation: every sensitive query includes `companyId`; reads and writes validate membership and entity ownership.
- Encryption: AES-256-GCM application-level encryption stores ciphertext, IV, auth tag, and key version. Keys live only in secret management.
- APIs and workers: strict Zod payloads, IDs-only queue jobs, trusted database reloads, ownership validation, rate limits, and idempotency keys.
- Files: allowlisted MIME plus extension pairs, randomized tenant-prefixed storage keys, private signed access, and virus-scan readiness.
- Billing and webhooks: signature verification, idempotency, payment confirmation, complete billing profiles, and immutable audit logs.
- Browser: CSP, HSTS, anti-framing, MIME-sniff prevention, referrer policy, and permissions policy.

## Incident response

Owners and administrators can revoke sessions and API keys, pause campaigns, disconnect accounts, lock billing changes, and mark a workspace under investigation. Every emergency action produces an immutable audit record.

## Monitoring

`SecurityEvent` records failed-login spikes, brute force, permission denials, anomalous API/campaign usage, suspicious uploads, worker failures, and billing webhook failures. HIGH and CRITICAL unresolved events must be surfaced to the admin dashboard and alerting pipeline.

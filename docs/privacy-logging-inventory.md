# Privacy Logging Inventory

This inventory supports, but does not itself establish, KVKK/GDPR compliance. Legal review is required.

| Record/field | Purpose | Category and masking | Storage/processor | Access | Retention/deletion |
|---|---|---|---|---|---|
| Request/correlation ID | Incident linkage | Random operational identifier | Vercel/Render and PostgreSQL references | Infrastructure/platform owner | Provider policy; linked DB policy |
| User/company/internal target IDs | Ownership and incident scope | Internal pseudonymous IDs | Provider logs or PostgreSQL | Restricted | Category policy |
| Actor email | Administrator evidence | Masked before storage | PostgreSQL `AuditLog` | Platform owner/auditor | Immutable pending legal policy |
| IP signal | Security investigation | Masked; no full IP in central observability | PostgreSQL security/audit | Platform owner/security role | Explicit security policy only |
| User agent | Compatibility/security | OS/client summary | PostgreSQL security/audit | Platform owner/security role | Explicit security policy only |
| Safe error | Reliability | Class, scrubbed message/code, stack where configured | Vercel/Render; optional Sentry | Infrastructure operator | Provider policy |
| Audit before/after | Administrative evidence | Minimal changed fields, recursive redaction | PostgreSQL `AuditLog` | Platform owner/auditor | Immutable pending legal policy |
| Security metadata | Detection/investigation | Allowlisted IDs/counts/codes, redacted | PostgreSQL `SecurityEvent` | Platform owner/security role | Explicit days; resolved-only deletion |
| Operational alert | Incident response | Aggregated type/count/safe metadata | PostgreSQL `OperationalAlert` | Platform owner/infrastructure | Explicit days; resolved-only deletion |
| Android crash event | App reliability | PII disabled, internal ID only, shared redaction | Sentry only if approved/configured | Approved engineering operators | Provider/legal setting |
| Browser client signal | Client reliability | Digest, class, route path, version only | PostgreSQL security event and JSON logs | Platform owner/operator | Security/provider policy |

## Excluded data

Passwords, hashes, MFA/recovery values, tokens/cookies, API/payment secrets, session credentials/snapshots, QR/pairing codes, full phone/email in broad logs, full IP by default, message/support content, contact/group lists, raw JIDs, attachment content, card data, and database connection strings.

## Data-subject requests

Search by internal user/company ID under an authorized workflow. Before disclosure or deletion, classify audit, security, financial, and legal-hold exceptions. Exports must exclude other tenants and secrets. Where deletion is permitted, anonymization should preserve event integrity and correlation; this workflow requires separate legal approval and is not automated in this phase.

## Processor decisions pending

Approve Vercel/Render log region and retention, Sentry processor/region/retention, full-IP exceptions, device/location signals, source-map operator access, and log archive encryption/deletion.

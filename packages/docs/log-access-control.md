# Log Access Control

## Current rule

Platform audit and security endpoints are protected by the backend `requirePlatformAdmin` guard. Under the current owner rule, only the authenticated `burakidim@gmail.com` identity is accepted. Client state, cached role flags, request email fields, and local storage do not grant access.

Normal users and company owners cannot access platform logs. Their existing activity pages remain tenant scoped and do not expose security/audit center data.

## Permissions

- `admin.audit.read`: immutable audit list and detail.
- `admin.security.read`: security list, detail, acknowledgment, and investigation status.
- Raw provider log access: infrastructure operator only; it is not exposed through the product UI.
- Future roles: security operator and read-only auditor must use explicit backend permissions and delegated-role enablement.

## Sensitive access evidence

Every audit/security API request creates a sensitive `AdminAccessLog`. Successful center access also appends `ADMIN_AUDIT_LOG_ACCESSED` or `ADMIN_SECURITY_LOG_ACCESSED`. Denied attempts create `ADMIN_ACCESS_DENIED` security events.

## Output minimization

APIs return masked email, masked IP, summarized user agent, safe before/after state, and allowlisted metadata. Legacy raw IP/user-agent fields are not selected. Export is disabled until legal approval, purpose, format, encryption, expiration, and recipient controls are defined.

## Session controls

Admin authorization enforces session age, permission checks, rate limits, and CSRF for browser mutations. Logout uses the existing session cleanup; admin pages never use a client cache as an authorization source.

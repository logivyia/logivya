# Security Event Taxonomy

Security events are evidence signals, not automatic accusations. Status is one of `OPEN`, `ACKNOWLEDGED`, `RESOLVED`, or `DISMISSED`. Severity is `INFO`, `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.

## Controlled event families

- Authentication: failed login, rate limit, refresh token rejection, session revocation, 2FA failure.
- Authorization: `ADMIN_ACCESS_DENIED`, `TENANT_ACCESS_DENIED`.
- Abuse/risk: trial risk, invitation risk, repeated rate-limit blocks.
- Integration: webhook signature failure, repeated WhatsApp authentication failure.
- Client reliability: `CLIENT_ERROR_REPORTED` with digest/name only.

## Data rules

Use user/company/internal target IDs. Do not store attempted passwords, submitted MFA codes, tokens, target private data, raw message content, QR/pairing data, raw JIDs, or raw request bodies. Network fields are masked/summarized.

## Investigation workflow

The platform owner may acknowledge, resolve, or dismiss a signal with a required note. The status workflow writes a separate immutable administrator audit event. It never modifies the original type, severity, actor, target, timestamp, or evidence metadata.

## Correlation

The request and correlation IDs link a security event to operational logs and admin access logs. The UI shows the correlation ID but not internal request bodies or secrets.

# Secure Data Export

Status: `LEGAL REVIEW REQUIRED`

## Flow

1. Authenticated user re-enters the current password.
2. The server creates a tenant/user-scoped `PrivacyExportJob` and one-time random download token; only its hash is stored.
3. Eligible data is serialized, gzip-compressed and encrypted with AES-256-GCM using an HMAC-derived per-object key.
4. The encrypted object is uploaded to a private S3-compatible/R2 bucket. No public URL is stored or returned.
5. The owner downloads through the authenticated API using the one-time token before expiry.
6. Successful use marks the token consumed. Retention removes expired objects.

Exports include bounded profile/company/membership/consent/request/support and owned WhatsApp metadata. They exclude password hashes, refresh/access tokens, MFA secrets/recovery codes, WhatsApp session credentials, encryption/provider secrets, internal notes, raw security internals and other users' records.

Required production secrets are documented in `.env.example`. Export processing must remain unavailable if storage/encryption configuration is incomplete.

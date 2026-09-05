# Log Redaction Policy

All structured metadata passes through the recursive redactor in `packages/logging`.

## Always redacted

Passwords and hashes, access/refresh/session/CSRF tokens, cookies, API/private keys, credentials, TOTP/recovery values, QR and pairing data, payment card secrets, database/Redis connection strings, WhatsApp session data, message bodies/content/keys, contact/group lists, raw JIDs, attachment content, support descriptions/content, device fingerprints, and request payloads.

Key matching is case-insensitive and works recursively. Arrays, depth, key count, string length, and cycles are bounded. Bearer tokens, JWT-shaped strings, connection URLs, and canary secrets are scrubbed from free text.

## Masking

- Email: first character plus masked local part and domain, for example `b***@example.com`.
- Phone: only a limited prefix and last four digits remain.
- IPv4: first two octets; IPv6: short prefix only.
- User agent: OS/client family summary.
- URL: origin and path only; query and fragment are removed.

## Prohibited patterns

Do not put a full request body in `safeMetadata`. Do not rename a sensitive field to evade the redactor. Do not log a message/contact/group collection, even if encrypted. Operational IDs must use database IDs or keyed equality hashes where a comparison is necessary.

## Verification

`npm run test:redaction` and `npm run test:logging` use password, token, TOTP, and WhatsApp credential canaries. `npm run check:production-console` blocks uncontrolled sinks in production source paths.

# Environment Matrix

Audit date: 2026-07-15.

Static scanning now covers tracked and untracked non-ignored source files. It found 166 referenced `process.env` names; all 166 are named in the root `.env.example`. The example also documents provider and restore placeholders that are intentionally not application references, for 200 documented names total. No public-prefixed secret-shaped name was found. The complete machine-readable list is `docs/environment-variable-inventory.json`; real values remain in deployment secret stores and ignored local files.

## Authoritative groups

| Group | Required in web/API | Required in worker | Mobile/build exposure | Classification |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Yes, identical database | Never | Runtime secret |
| `REDIS_URL` | Yes for queues/health | Yes, identical Redis | Never | Runtime secret |
| `AUTH_SECRET`, `PASSWORD_PEPPER` | Yes | No direct auth use | Never | Runtime secret |
| `FIELD_ENCRYPTION_KEY_V1`, `FIELD_ENCRYPTION_ACTIVE_VERSION` | Required for field/session encryption | Required and must match web | Never | Runtime secret plus non-secret version label |
| `WHATSAPP_SESSION_SECRET` / `SESSION_ENCRYPTION_KEY` | Fallback only | Fallback only | Never | Secret; migrate toward the versioned field key |
| `WHATSAPP_SESSION_DIR`, `WHATSAPP_SESSION_VOLUME_PERSISTENT` | No | Yes | Never | Runtime configuration |
| `WHATSAPP_*` timing/rate settings | No | Optional defaults | Never | Runtime configuration |
| `CRON_SECRET` | Yes for cron routes | No | Never | Runtime secret |
| SMTP/provider credentials | Yes when email is enabled | No | Never | Runtime secrets |
| Payment provider credentials/webhook secrets | Yes when provider enabled | No | Never | Runtime secrets |
| `EXPO_PUBLIC_*` | No | No | Yes | Public build-time values; secrets are forbidden |
| `ANDROID_VERSION_CODE`, `IOS_BUILD_NUMBER`, `EAS_BUILD_PROFILE` | No | No | Yes | Build-time non-secret |
| `BACKUP_*` and `BACKUP_SECONDARY_*` | Backup runner only | No application runtime access | Never | Dedicated backup credentials and encryption secret |

## Confirmed production endpoints

- PostgreSQL host: Neon pooled endpoint in AWS us-east-1, TLS.
- Redis host: Upstash endpoint, `rediss` TLS.
- Android production API fallback: `https://www.logivya.com`.
- No production mobile source points to localhost; localhost appears only in the development profile.

## Risks and remediation

1. `src/config/env.ts` is not a global runtime gate; service-specific startup checks remain authoritative.
2. Historical aliases exist: `AUTH_SECRET`/`NEXTAUTH_SECRET`, `REDIS_URL`/`KV_URL`, `SMTP_FROM`/`EMAIL_FROM`, and several mobile minimum-version names.
3. `S3_ACCESS_KEY_ID` in `src/config/env.ts` did not match the old example names.
4. `SUPER_ADMIN_EMAIL` is a bootstrap input, while the single platform-owner email is intentionally code-pinned by product policy. It is not a password or credential.
5. No `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` secret-shaped name was found.
6. Tracked connection strings contain local placeholder credentials only; no tracked production URL/private key was detected.

The checked-in `.env.example` now names all statically referenced variables and labels destructive integration-test guards. Production secret values must remain in Vercel, Render, GitHub Actions and the selected backup provider. Rotation order is: create a second key/version, deploy readers that accept both, migrate data, switch active version, verify, then revoke the old key.

# Enterprise Security Hardening Audit

Date: 2026-07-16

Scope: web, mobile web, Android, API, authentication, authorization, tenant isolation, support, subscriptions, WhatsApp ownership boundaries, deployment configuration, and release controls.

## Release decision

The code is not release-approved until production deployment, production smoke tests, and Android fresh-install/upgrade checks complete. Compilation alone is not acceptance evidence.

## Controls verified before changes

- TOTP follows RFC 6238 and supports authenticator QR setup, manual secret entry, encrypted secret storage, recovery codes, trusted devices, admin reset, and replay prevention.
- Passwords use Argon2id with a deployment pepper. Password reset tokens are one-time, expire, are attempt-limited, and revoke existing sessions after use.
- Web sessions use opaque random tokens stored as hashes and HttpOnly cookies.
- Mobile uses short-lived access tokens and opaque refresh tokens stored with Expo SecureStore.
- Backend authorization resolves the authenticated user, active membership, company, permissions, and platform-admin guard. Client flags are not trusted as authorization.
- Support, subscription, WhatsApp account, group, category, contact, campaign, and delete operations use company/user ownership filters.
- Pairing, registration, password reset, invitations, support creation/replies, and MFA verification already had abuse controls.
- Audit logs and privacy-safe security events already existed.

## Findings fixed

### Sessions and tokens

- Mobile JWTs now require an HS256 JWT header, issuer, audience, JTI, subject, company, session, role, integer timestamps, expiration, clock-skew bounds, and a maximum 15-minute lifetime.
- Mobile refresh tokens now rotate under a PostgreSQL advisory lock. Consumed token hashes are retained until expiration so reuse can be detected.
- Refresh replay revokes the token family session and trusted device and emits a critical security event.
- Web login rotates any existing session cookie before issuing a replacement, records a privacy-safe device fingerprint, and uses a high-priority cookie.
- Web activity timestamps are updated with a five-minute write throttle.
- Authenticated users can list their own web/mobile sessions, revoke one of their own sessions, or log out everywhere. All queries include the authenticated user ID.

### API and browser security

- Cookie-authenticated state-changing API requests require a matching Origin and Host. Bearer-token mobile requests remain compatible.
- Login and refresh endpoints use durable database-backed rate limiting.
- Message campaign creation and Delete for Everyone request entrypoints are rate-limited by company and user without changing the delivery queue or worker behavior.
- Outbound URL validation rejects non-HTTPS URLs, embedded credentials, localhost, loopback, private, link-local, ULA, and mapped-private addresses.
- Security headers include HSTS, CSP, frame denial, MIME sniffing denial, referrer policy, permissions policy, COOP, CORP, and cross-domain policy denial.

### Android

- Release builds disable cleartext traffic and Android backup.
- Unused external-storage and system-overlay permissions were removed.
- SecureStore uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and migrates legacy token keys without forcing existing users to sign in again.
- The security/MFA screen blocks screenshots and app-switcher capture while mounted.
- Recovery-code clipboard content is automatically cleared after 60 seconds when unchanged.

### Operations

- The admin security center includes failed logins, blocked attempts, MFA-enabled users, suspicious devices, suspicious IPs, tenant violations, security alerts, and recent admin actions.
- Password-reset logs use an opaque identifier hash instead of the submitted email address.
- All referenced monitoring variables are documented in `.env.example`; no secret value is committed.

## Penetration and regression evidence

Automated contracts cover:

- forged, expired, wrong-audience, future-issued, and overlong JWTs;
- refresh replay implementation and family revocation contract;
- MFA entropy, enrollment gate, recovery, and TOTP replay persistence;
- cookie CSRF enforcement and SSRF-sensitive URL rejection;
- admin guard and direct admin endpoint denial contracts;
- session ownership and tenant ownership filters;
- WhatsApp group/account ownership, duplicate JIDs, category assignment, and message recipient isolation;
- Android manifest and SecureStore hardening;
- stable WhatsApp pairing/session persistence, message delivery, Delete for Everyone, continuous delivery, and mobile authentication resilience.

Live database integrity evidence on 2026-07-16 found zero duplicate memberships, duplicate sessions, duplicate groups, duplicate contacts, group/contact ownership mismatches, missing required indexes, incomplete migrations, or unvalidated constraints.

## Migration safety

`20260716170000_mobile_refresh_token_replay_detection` is additive. It creates one history table, indexes, and a cascading foreign key to an existing mobile session. It does not drop, rename, backfill, or rewrite production data. GitHub Actions run `29509754659` completed both the encrypted primary/secondary backup job and isolated restore drill successfully before the migration. The migration was then applied to production, and Prisma reported 37/37 migrations current with no incomplete migration or integrity failure.

## Residual risks and explicit decisions

- The current static-compatible Next.js CSP retains `unsafe-inline`. A nonce CSP would force dynamic rendering across affected pages in this Next.js version; it should be introduced as a separate measured architecture change.
- Android root detection and Play Integrity are optional readiness items, not authentication controls, and are not enabled in this phase.
- The mobile dependency audit has no high or critical findings. Remaining moderate findings are in Expo 54 build/configuration transitive dependencies and require a breaking Expo 57 upgrade. A forced major upgrade is not included in this release.
- The integrity report found four historical WhatsApp snapshot metadata rows without an encrypted snapshot. This is an existing recoverability warning, not a cross-tenant or authentication failure; the protected WhatsApp core was not rewritten to mask it.
- A real external penetration test and production provider logs remain separate operational evidence. Source contracts are not represented as a substitute for an independent assessment.

## Stable core impact

No Baileys socket, WhatsApp credential snapshot, group synchronization, delivery worker, queue retry, message-key storage, subscription entitlement, or support conversation engine was rewritten. Message security changes are limited to authenticated API-entry abuse controls and are covered by the stable-core regression suite.

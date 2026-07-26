# LOGIVYA Shared MFA Authentication Incident

Status: MITIGATED - REAL ACCOUNT VALIDATION PENDING / RELEASE BLOCKED

Opened: 2026-07-26

Owner: Production authentication incident response

## Evidence Labels

- VERIFIED: Supported by production data, deployed source, configuration metadata, or a deterministic test.
- LIKELY: Strongly supported, but not yet reproduced against the current production runtime.
- NOT CONFIRMED: Plausible and still requires evidence.
- RULED OUT: Direct evidence contradicts this explanation.

## Required Incident Record

1. Incident summary
   - VERIFIED: Correct-credential users on web and Android versionCode 151 reach MFA but cannot complete authentication reliably.
   - VERIFIED: The same shared production backend serves both affected clients.
2. Affected platforms
   - VERIFIED: Desktop/mobile web and Android.
   - VERIFIED: The submitted iOS build must remain untouched.
3. Affected production versions
   - VERIFIED: Android versionCode 151.
   - VERIFIED: Vercel production deployment `dpl_8RyvfwnoyTfMfgzahN1Q8nWP4Wiz`.
4. Reproduction steps
   - VERIFIED: Submit valid email/password, receive the Authenticator challenge, submit the current six-digit TOTP, then receive a generic error or Android recovery screen.
5. Latest failure timestamps
   - VERIFIED: Real-account web MFA failure at `2026-07-26T12:00:01.283Z`.
   - VERIFIED: Web MFA failure at `2026-07-26T08:44:04.518Z`.
   - VERIFIED: Android v151 MFA challenge issued at `2026-07-26T09:08:11.289Z`; additional v151 challenges occurred at 08:57, 08:46, 08:44, and 08:43 UTC.
6. Correlation references
   - VERIFIED: Latest real web verification failure correlation `a30c2cba-02c5-49ed-b0ab-ab5907210287`.
   - VERIFIED: Android exposed a reference beginning with `mobile-recovery-ms`.
   - NOT CONFIRMED: Historical requests did not persist a complete end-to-end correlation ID.
7. HTTP status codes
   - VERIFIED: The latest real web TOTP failure returned HTTP 401 with `MFA_INVALID`.
8. Backend authentication stage reached
   - VERIFIED: Credential verification and MFA challenge persistence completed.
   - VERIFIED: The v151 web request reached TOTP code comparison and recorded `MFA_INVALID`.
9. Exact stage where the flow failed
   - VERIFIED for the latest real web attempt: TOTP verification returned invalid before session creation.
   - VERIFIED for the current GitHub deployment contract: encrypted TOTP secret lookup fails before code comparison when only the production `MFA_FIELD_ENCRYPTION_*` variables are present.
10. Safe exception type
    - VERIFIED for the latest real-account failure: no exception; verification returned the safe domain result `MFA_INVALID`.
    - VERIFIED by the earlier deterministic production-contract reproduction: `Error("MFA_ENCRYPTION_NOT_CONFIGURED")`.
    - NOT CONFIRMED: The historical Vercel runtime stack trace is outside the 30-minute log retention window.
11. Relevant backend version
    - VERIFIED current production repair: Git commit `48822d7f9cb7441ae5e8b0771e8116215eb5d01f`.
12. Relevant Android versionCode
    - VERIFIED: 151.
13. Web client version
    - VERIFIED: The web client bundled in deployment `dpl_8RyvfwnoyTfMfgzahN1Q8nWP4Wiz`.
14. Production API endpoints used
    - VERIFIED: `/api/auth/login`, `/api/auth/mfa/login/verify`, `/api/mobile/auth/login`, and `/api/mobile/auth/mfa/verify`.
15. Production environment inspected
    - VERIFIED: Vercel project `prj_xFj2yXn27cnFpyW7Llxr874AgFuZ`, production target, ready deployment created on 2026-07-26.
16. TOTP validation result
    - VERIFIED: The recorded web attempt returned `MFA_INVALID`.
    - RULED OUT: v151 converting `Date.now()` to Unix seconds is not an epoch-unit bug. Installed otplib 13.4.1 documents and deterministically verifies an epoch in seconds.
17. MFA challenge result
    - VERIFIED: Challenges were issued and persisted for both web and Android v151.
18. Session creation result
    - VERIFIED for the recorded failed attempt: Not reached.
    - NOT CONFIRMED for a current valid-code attempt.
19. Cookie or token delivery result
    - VERIFIED for the recorded failed attempt: Not reached.
    - NOT CONFIRMED for a current valid-code attempt.
20. Android bootstrap result
    - VERIFIED: Affected Android attempts do not reach a stable authenticated bootstrap and may enter `mobile-recovery-ms`.
21. Confirmed root cause
    - VERIFIED continuing real-account root cause: the account had a valid active `TOTP` credential and a newer active `EMAIL_OTP` credential. The shared verifier selected the newest active credential without filtering by method, so the `EMAIL_OTP` record shadowed the Google Authenticator credential and every correct TOTP returned `MFA_INVALID`.
    - VERIFIED earlier contributing contract break: production defines `MFA_FIELD_ENCRYPTION_ACTIVE_VERSION` and `MFA_FIELD_ENCRYPTION_KEY_V1`, while commit `388ef803` read only `FIELD_ENCRYPTION_ACTIVE_VERSION` and `FIELD_ENCRYPTION_KEY_*`.
22. Contributing causes
    - VERIFIED: Active MFA credential selection was method-agnostic in login detection, TOTP verification, recovery-code replacement, and TOTP activation cleanup.
    - VERIFIED: MFA verification routes consume the challenge before session creation, so a later session failure makes the challenge unusable.
    - VERIFIED: Historical routes do not emit safe stage-level correlation diagnostics.
    - VERIFIED: Unknown backend errors collapse into generic client messages.
    - VERIFIED: Vercel Hobby runtime logs are retained in the dashboard for only 30 minutes, so the historical exception is unavailable.
23. Implemented corrections
    - Accept both the dedicated `MFA_FIELD_ENCRYPTION_*` names and the legacy `FIELD_ENCRYPTION_*` names.
    - Select only active `TOTP` credentials for Authenticator challenge detection, code verification, recovery codes, enrollment, and activation.
    - Keep other MFA methods independent instead of allowing them to shadow or revoke TOTP credentials.
    - Emit privacy-safe stage diagnostics and stable public error codes.
    - Prevent challenge loss when session creation fails.
    - Add deterministic keyring, credential-policy, challenge, session, and error-contract regression tests.
24. Deployment risks
    - Existing encrypted MFA secrets must remain decryptable.
    - The fix must be backward compatible with Android v151 and the iOS build under review.
    - Session and challenge ordering must not create duplicate sessions or allow TOTP replay.
25. Required regression tests
    - Valid and invalid TOTP, previous/current/next period, replay rejection.
    - Dedicated and legacy keyring environment aliases.
    - Expired, locked, consumed, and duplicate challenge behavior.
    - Session creation failure does not silently destroy the challenge.
    - Web cookie session, Android token session, profile bootstrap, refresh, logout, and re-login.
    - Stable safe error codes and correlation IDs; no secret-bearing diagnostics.

## Production Evidence

- VERIFIED: The production database audit for the preceding 24 hours found 43 successful login attempts, 11 `MFA_INVALID` failures, 7 `MOBILE_INVALID_CREDENTIALS` failures, and 5 `INVALID_CREDENTIALS` failures.
- VERIFIED: The audit found 14 successful Android `1.0.121` primary-login events, so the API and database were not globally unavailable.
- VERIFIED: The affected account had one active verified `TOTP` credential and one newer active verified `EMAIL_OTP` credential.
- VERIFIED: Vercel response time and the operator workstation UTC time agree within the request duration; production clock skew is not the current root cause.
- NOT CONFIRMED: Local inability to decrypt those credentials is not evidence of a production key failure because Vercel does not expose sensitive environment values to the local pull.
- RULED OUT: Total production API outage, total database outage, missing MFA challenge persistence, server clock skew, and an otplib epoch-unit mismatch.

## Authentication Flow Map

1. Credential verification
2. Company membership resolution
3. MFA challenge creation and persistence
4. Encrypted TOTP credential lookup and decryption
5. TOTP validation and replay protection
6. Challenge consumption
7. Web or mobile session creation
8. Cookie or access/refresh token delivery
9. Authenticated profile bootstrap

The correction must preserve the flow while making stages 4-8 observable and failure-safe.

## Repair Attempts

### Attempt 0 - Historical v151 diagnosis

Status: FAILED / EVIDENCE COLLECTION

Change made: None.

Reason: Establish the real failed stage before modifying production.

Files changed: This incident report only.

Deployment identifier: `dpl_8RyvfwnoyTfMfgzahN1Q8nWP4Wiz` (existing deployment).

Test results:

- PASS: Production database auth audit.
- PASS: otplib 13.4.1 epoch contract test.
- FAIL: Real web and Android MFA completion, as reported and reflected by production audit events.

Production result: Authentication remains blocked for affected MFA users.

New evidence:

- The v151 epoch-unit hypothesis was rejected.
- A deployed-code/configuration name mismatch was verified.
- Current routes consume the challenge before session creation.

Next action: Implement the keyring compatibility fix, safe stage diagnostics, public error mapping, and failure-safe challenge/session handling; then deploy and run a fresh correlated login.

### Attempt 1 - Production keyring contract and transaction repair

Status: LOCAL VALIDATION PASSED / PRODUCTION DEPLOYMENT PENDING

Change made:

- Added dedicated `MFA_FIELD_ENCRYPTION_*` support with legacy `FIELD_ENCRYPTION_*` fallback.
- Added legacy-key decryption fallback when dedicated and legacy keys share the same version label, preserving credentials encrypted before a key-namespace migration.
- Added a strict 32-byte active-key validation.
- Added privacy-safe authentication-stage diagnostics with correlation ID, opaque user/challenge references, platform, client version, backend version, status, exception type, and duration.
- Moved challenge consumption into the same database transaction as web/mobile session creation.
- Added stable configuration/session error mapping without exposing internal exception text or secret material.

Reason for the change: A regression test using the exact production variable names reproduced `MFA_ENCRYPTION_NOT_CONFIGURED` on the deployed source.

Files changed:

- `src/server/security/mfa.ts`
- `src/server/auth/diagnostics.ts`
- `src/server/auth/session.ts`
- `src/server/mobile/auth.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/mfa/login/verify/route.ts`
- `src/app/api/mobile/auth/login/route.ts`
- `src/app/api/mobile/auth/mfa/verify/route.ts`
- `src/i18n/api-error.ts`
- `src/server/mobile/response.ts`
- `scripts/test-auth-production-incident.ts`
- `package.json`

Deployment identifier: Pending.

Test results:

- PASS: `npm run test:auth-incident`
- PASS: `npm run test:enterprise-mfa`
- PASS: `npm run test:mobile-auth-resilience`
- PASS: `npm run typecheck`
- PASS: `npm run mobile:typecheck`
- PASS: `npm run lint`
- PASS: `npm run build`
- PASS: `npm run test:redaction`
- PASS: `npx prisma validate`
- PASS: Stable Core contract, mobile auth resilience, WhatsApp session persistence, message delivery, Delete for Everyone, and continuous-delivery tests.
- PASS: Production tenant-isolation audit: no missing owners, ownership mismatches, duplicate account group JIDs, foreign category assignments, or foreign message recipients.
- PENDING: GitHub CI, production deploy, and real correlated web/Android login.

Production result: Pending deployment.

New evidence:

- The new incident regression test failed before the correction with `MFA_ENCRYPTION_NOT_CONFIGURED`.
- The same test passes after the alias correction.
- A dedicated `v1` key and a different legacy `v1` key can coexist while credentials encrypted by the legacy key remain verifiable.
- Existing RFC 6238 and mobile auth resilience suites remain green.

Next action: Commit the reviewed repair, pass GitHub CI, deploy the backward-compatible backend/web change, then capture a fresh real web and Android v151 MFA attempt.

### Attempt 2 - Method-isolated MFA credential selection

Status: PRODUCTION PROOF PASSED / REAL ACCOUNT CONFIRMATION PENDING

Change made:

- Added one canonical active-TOTP credential policy.
- Restricted login challenge detection and TOTP/recovery verification to `type = "TOTP"`.
- Restricted TOTP enrollment cleanup and activation cleanup to TOTP records so independent MFA methods cannot shadow or revoke each other.
- Added regression assertions for verified-only and setup-time TOTP selection.

Reason for the change:

- Production correlation `a30c2cba-02c5-49ed-b0ab-ab5907210287` proved that credential verification, challenge lookup, and encrypted-secret access completed before `MFA_INVALID`.
- A privacy-safe production database audit proved the affected account had a newer active `EMAIL_OTP` record ahead of its valid active `TOTP` record.
- The old verifier ordered all active credential types by creation time and therefore selected the wrong method.

Files changed:

- `src/server/auth/mfa-credential-policy.ts`
- `src/server/auth/mfa-challenge.ts`
- `src/server/security/mfa.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/mobile/auth/login/route.ts`
- `scripts/test-auth-production-incident.ts`

Deployment:

- Commit: `48822d7f9cb7441ae5e8b0771e8116215eb5d01f`
- Vercel production deployment: `dpl_ARG8LjcFTCZGWoUPHuSiFc6Y25bS`
- Production aliases: `https://www.logivya.com` and `https://logivya.com`
- GitHub Security Gates run `30201633557`: passed.
- GitHub Stable Core Gate run `30201633518`: passed.

Test results:

- PASS: `npm run test:auth-incident`
- PASS: `npm run test:enterprise-mfa`
- PASS: `npm run test:mobile-auth-resilience`
- PASS: `npm run typecheck`
- PASS: mobile typecheck
- PASS: `npm run lint`
- PASS: `npm run build`
- PASS: security, admin-security, and enterprise-hardening suites
- PASS: WhatsApp stable-core, session persistence, message pipeline, Delete for Everyone, and continuous delivery suites
- PASS: Production group isolation audit with all violation counts at zero
- PASS: Production mixed-credential proof with active credential order `EMAIL_OTP`, `TOTP`
- PASS: Production web password, TOTP, session, and profile bootstrap
- PASS: Production Android 1.0.121 password, TOTP, access/refresh token, and profile bootstrap

Production proof correlations:

- Web login: `083b6dd2-715a-4389-8551-4a871fe24585`
- Web MFA verification: `97c6dd9c-dbbe-4a63-aca0-ec1b43bb9e5f`
- Android 1.0.121 login: `e86ad526-3abc-47d8-bf4f-4a4a52c1f9e3`
- Android 1.0.121 MFA verification: `c9d34ac1-b91d-4362-80fb-5f34741cf54f`

Cleanup:

- The temporary proof account was anonymized and suspended.
- All proof sessions, challenges, trusted devices, and MFA credentials were revoked or consumed.
- No real user credential, Authenticator secret, password, token, or cookie was read or changed.

Release decision:

- No Android AAB is required for this backend-only correction.
- Android versionCode 152 remains blocked until the affected real account completes web and Android login.
- The submitted iOS build remains untouched.

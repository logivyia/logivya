# LOGIVYA Shared MFA Authentication Incident

Status: RESOLVED - PRODUCTION VALIDATED - ANDROID v152 NOT REQUIRED

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
   - VERIFIED: Failed Vercel production deployment `dpl_8RyvfwnoyTfMfgzahN1Q8nWP4Wiz`.
   - VERIFIED: Corrected Vercel production deployment `dpl_DXYAwr19PeZJy5XwtKsr1mydU4FB`.
4. Reproduction steps
   - VERIFIED: Submit valid email/password, receive the Authenticator challenge, submit the current six-digit TOTP, then receive a generic error or Android recovery screen.
5. Latest failure timestamps
   - VERIFIED: Web MFA failure at `2026-07-26T08:44:04.518Z`.
   - VERIFIED: Android v151 MFA challenge issued at `2026-07-26T09:08:11.289Z`; additional v151 challenges occurred at 08:57, 08:46, 08:44, and 08:43 UTC.
6. Correlation references
   - VERIFIED: Android exposed a reference beginning with `mobile-recovery-ms`.
   - VERIFIED after repair: web valid TOTP `9d7d4d54-e4d6-48f8-a75a-bb6c78406cc8`.
   - VERIFIED after repair: Android v151 valid TOTP `cc00ac97-6ffd-4ad4-9951-b59c1194ca4f`.
   - VERIFIED after repair: Android v151 invalid TOTP `c877941b-9bae-4366-a475-3dd2edb5b883`.
7. HTTP status codes
   - NOT CONFIRMED: The historical failed response status is not retained in the available audit record.
   - VERIFIED after repair: valid web TOTP returned 200; valid Android v151 TOTP returned 200; invalid Android TOTP returned 401.
8. Backend authentication stage reached
   - VERIFIED: Credential verification and MFA challenge persistence completed.
   - VERIFIED: The v151 web request reached TOTP code comparison and recorded `MFA_INVALID`.
9. Exact stage where the flow failed
   - VERIFIED for the recorded web attempt: TOTP verification returned invalid before session creation.
   - VERIFIED for the current GitHub deployment contract: encrypted TOTP secret lookup fails before code comparison when only the production `MFA_FIELD_ENCRYPTION_*` variables are present.
   - VERIFIED after repair: secret decryption, TOTP verification, session creation, and token/cookie delivery all completed.
10. Safe exception type
    - VERIFIED by a deterministic production-contract reproduction: `Error("MFA_ENCRYPTION_NOT_CONFIGURED")`.
    - NOT CONFIRMED: The historical Vercel runtime stack trace is outside the 30-minute log retention window.
11. Relevant backend version
    - VERIFIED failed version: Git commit `388ef803efb603744f856902df00ed00168b4e59`.
    - VERIFIED repaired version: Git commit `246e0cfade2bd9d43249da5f2157b0041b26b13f`.
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
    - VERIFIED after repair: web and Android v151 session creation succeeded.
19. Cookie or token delivery result
    - VERIFIED for the recorded failed attempt: Not reached.
    - VERIFIED after repair: web cookie delivery and Android access/refresh token delivery succeeded.
20. Android bootstrap result
    - VERIFIED before repair: affected Android attempts did not reach a stable authenticated bootstrap and could enter `mobile-recovery-ms`.
    - VERIFIED after repair: the Android v151 production API contract reached authenticated `/api/mobile/auth/me`.
21. Confirmed root cause
    - VERIFIED code/config contract break: production defines `MFA_FIELD_ENCRYPTION_ACTIVE_VERSION` and `MFA_FIELD_ENCRYPTION_KEY_V1`, while commit `388ef803` reads only `FIELD_ENCRYPTION_ACTIVE_VERSION` and `FIELD_ENCRYPTION_KEY_*`.
22. Contributing causes
    - VERIFIED: MFA verification routes consume the challenge before session creation, so a later session failure makes the challenge unusable.
    - VERIFIED: Historical routes do not emit safe stage-level correlation diagnostics.
    - VERIFIED: Unknown backend errors collapse into generic client messages.
    - VERIFIED: Vercel Hobby runtime logs are retained in the dashboard for only 30 minutes, so the historical exception is unavailable.
23. Proposed corrections
    - Accept both the dedicated `MFA_FIELD_ENCRYPTION_*` names and the legacy `FIELD_ENCRYPTION_*` names.
    - Add a startup/runtime keyring contract check without exposing key material.
    - Add privacy-safe stage diagnostics and stable public error codes.
    - Prevent challenge loss when session creation fails.
    - Add deterministic TOTP, keyring-alias, challenge, session, and error-contract regression tests.
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

26. Release decision
    - GO for the shared production backend authentication repair.
    - Android v151 works against the repaired backend; no versionCode 152 AAB is required.
    - The iOS submission was not modified or resubmitted.

## Production Evidence

- VERIFIED: The production database audit for the preceding 24 hours found 43 successful login attempts, 11 `MFA_INVALID` failures, 7 `MOBILE_INVALID_CREDENTIALS` failures, and 5 `INVALID_CREDENTIALS` failures.
- VERIFIED: The audit found 14 successful Android `1.0.121` primary-login events, so the API and database were not globally unavailable.
- VERIFIED: Two active TOTP credentials exist.
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

Next action: Completed in Attempt 2.

### Attempt 2 - Production deployment and correlated end-to-end validation

Status: PASSED / INCIDENT RESOLVED

Change made:

- Fast-forwarded commit `246e0cfade2bd9d43249da5f2157b0041b26b13f` to `main`.
- Deployed the repaired backend/web bundle to Vercel production.
- Ran a temporary isolated production tenant through registration, MFA enrollment, logout, challenged login, valid/invalid TOTP, web profile bootstrap, Android v151 token issuance, and Android profile bootstrap.
- Retired and anonymized the temporary tenant while preserving the append-only audit trail; revoked every temporary session and MFA credential.

Reason for the change: Local deterministic tests proved the old code/config contract failed, but release approval required a real production session and profile bootstrap on both affected client contracts.

Deployment identifier:

- Vercel: `dpl_DXYAwr19PeZJy5XwtKsr1mydU4FB`
- Git: `246e0cfade2bd9d43249da5f2157b0041b26b13f`
- Production aliases: `https://www.logivya.com`, `https://logivya.com`

Test results:

- PASS: GitHub `Security Gates` run `30200652263`.
- PASS: GitHub `Stable Core Gate` run `30200652273`.
- PASS: `/api/health/live` returned `{"status":"ok"}`.
- PASS: Web MFA enrollment and enrollment verification.
- PASS: Web valid TOTP, cookie session creation, and `/api/auth/me` bootstrap.
- PASS: Android v151 MFA challenge, valid TOTP, access/refresh token creation, and `/api/mobile/auth/me` bootstrap.
- PASS: Android invalid TOTP returned HTTP 401 with `MFA_INVALID`.
- PASS: Vercel stage logs recorded `CHALLENGE_LOOKUP`, `TOTP_SECRET_DECRYPTION`, `TOTP_VERIFICATION`, `SESSION_CREATION`, and `TOKEN_OR_COOKIE_DELIVERY` with no secret material.
- PASS: Post-test active temporary users, memberships, web sessions, mobile sessions, and MFA credentials all equal zero.

Production result:

- Web valid TOTP correlation `9d7d4d54-e4d6-48f8-a75a-bb6c78406cc8` reached cookie delivery in 69 ms.
- Android v151 valid TOTP correlation `cc00ac97-6ffd-4ad4-9951-b59c1194ca4f` reached token delivery in 73 ms.
- Android invalid TOTP correlation `c877941b-9bae-4366-a475-3dd2edb5b883` was rejected at TOTP verification with HTTP 401.

Environment changes:

- None. The code was corrected to honor the existing production `MFA_FIELD_ENCRYPTION_*` contract and retain legacy-key compatibility.

Final action:

- Close the shared authentication incident.
- Keep Android versionCode 151; do not create versionCode 152 for this backend-only repair.
- Leave the iOS submission untouched.

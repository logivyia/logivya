# Mobile Security, MFA, and Local App Lock

## Security model

Web, mobile web, Android, and iOS use the same backend authentication and MFA policy. Client state controls presentation only. The backend validates the session, company membership, MFA policy, trusted device, and endpoint permission for every protected operation.

The supported login factors are:

- password only when the organization policy permits it;
- TOTP from an authenticator application;
- email OTP;
- one-time recovery codes for an already enrolled account.

SMS is not an authentication factor. Notification SMS placeholders are not part of login or MFA.

## Organization policy

The company policy is backend owned and supports `NONE`, `REQUIRE_ANY_MFA`, `REQUIRE_TOTP`, and `REQUIRE_TOTP_FOR_ADMINS`. A client cannot satisfy or bypass policy with a local role or flag. Existing companies default to `NONE`, so rollout does not silently lock out password-only users.

## TOTP and recovery codes

TOTP enrollment requires the current password and a valid six-digit confirmation. Pending enrollment is bound to the user and cannot create an authenticated session. Secrets are masked by default, sensitive screens block capture, and copied values are cleared from the clipboard.

Recovery codes are hashed, one-time values. Regeneration invalidates the previous set. Disabling a factor requires fresh proof and triggers security notifications, audit events, and session review.

## Email OTP

Email OTP is optional unless company policy requires an MFA factor. Codes are generated server-side, hashed at rest, bound to their challenge and purpose, expire after five minutes, and are consumed once. Send, resend, and verification paths apply cooldowns, attempt limits, and operation rate limits. The server sends an email code only when email OTP is the selected login method.

## Local mobile application lock

The application lock is independent from account MFA. It protects an already authenticated native app when the device changes state.

- The user creates exactly six numeric digits.
- The PIN never leaves the device and is never logged or sent to an API.
- SecureStore uses device-only, locked-device protection.
- Each Logivya user receives a separate SecureStore key derived from a one-way user identifier hash.
- Only a salted, repeatedly hashed PIN verifier is stored.
- Verification uses a constant-time comparison and escalating temporary blocks after repeated failures.
- Android BiometricPrompt, Face ID, Touch ID, or fingerprint can unlock only after a PIN has configured the local lock.
- Biometric authentication requires the platform's strong level and does not replace the Logivya PIN with device-passcode fallback.
- Auto-lock supports immediate, 1-minute, 5-minute, and 15-minute background intervals.
- Forgotten PIN recovery deletes only the local verifier and then clears the account session. Account credentials and backend MFA are required again.

No PIN, PIN hash, salt, biometric template, or biometric result is stored on the Logivya backend.

## Privacy controls

- The locked overlay blocks screen capture.
- App-switcher privacy obscures the native preview while backgrounded.
- The native Security Center already blocks sensitive screen capture.
- Android notification channels use private lock-screen visibility.
- Push alerts expose only the application name. Full notification content is available after the user opens the authenticated in-app notification center.
- Session tokens remain in SecureStore. AsyncStorage is not an authentication or authorization source.

## Audit and observability

App-lock enable, disable, PIN change, biometric preference, timeout, app-switcher privacy, and recovery events use the authenticated mobile security-event endpoint. The endpoint has a strict allowlist, payload validation, tenant/user binding, operation rate limiting, safe metadata, request correlation, and centralized `SecurityEvent` recording.

The audit endpoint never accepts PIN material or biometric data. Local changes remain usable offline; an unavailable audit endpoint is reported to privacy-safe crash telemetry and does not persist secrets.

## Migration and compatibility

The application lock needs no database migration because local lock material is device-only. Existing optional-MFA schema changes remain additive in `prisma/migrations/20260721160000_optional_multi_factor_authentication`. Existing sessions, TOTP enrollment, email OTP, recovery codes, WhatsApp sessions, message delivery, and Delete for Everyone are not rewritten by the app-lock feature.

## Automated verification

```bash
npm run test:optional-mfa
npm run test:enterprise-mfa
npm run test:mobile-app-lock
npm run test:mobile-dashboard-security
npm run test:stable-core
npm run typecheck
npm run lint
npm run build
npm --prefix apps/mobile run typecheck
```

## Real-device acceptance matrix

Run on at least one supported Android device and one supported iPhone:

1. Password-only login succeeds under policy `NONE`.
2. TOTP and email OTP login each succeed; expired, replayed, and incorrect codes fail.
3. Enable the six-digit lock, background the app, and verify every timeout option.
4. Verify correct PIN, incorrect PIN, escalating block, Face ID/Touch ID/BiometricPrompt, cancel, and PIN fallback.
5. Restart the process and reboot the device; the correct account-specific lock remains active.
6. Sign out, sign in as another user, and confirm lock settings do not cross accounts.
7. Use Forgot PIN and confirm that account login plus backend MFA is required.
8. Confirm screenshots are blocked while locked and app-switcher content is obscured.
9. Confirm lock-screen push previews contain no ticket, message, company, phone, or account detail.
10. Re-run login, WhatsApp connected state, owned groups, send, message history, and Delete for Everyone.

## Release decision

Automated checks can prove contracts, compilation, and regression coverage. They cannot prove Face ID, Touch ID, BiometricPrompt, operating-system app-switcher rendering, or notification presentation on a physical device.

The release is **NO-GO** until the Android and iOS real-device matrix is recorded as passed. A signed AAB or TestFlight build may be produced for that controlled acceptance test, but it must not be described as production-approved until those results exist.

# LOGIVYA Enterprise Security PRD-4 Implementation Report

Date: 2026-07-22

## Decision

- Source implementation: GO
- Automated regression and security validation: GO
- Android bundle validation: GO for local validation only
- Production release / App Review submission: NO-GO until the manual and environment gates below are evidenced

This report does not treat compilation as production acceptance. No production-ready claim is made without real-device, target-environment, and store-lineage evidence.

## Implemented Controls

### Authentication and MFA

- Existing TOTP, recovery-code, trusted-device, session-management, and security-event flows are preserved.
- Existing email OTP remains optional and server-controlled.
- Organization policy remains the source of truth for whether MFA is required.
- No SMS authentication factor was added.
- Client state cannot grant or bypass server-side MFA requirements.

### Native App Lock

- Added an optional six-digit local PIN.
- PIN material is salted and repeatedly hashed; plaintext PIN is never persisted.
- Local lock data uses platform secure storage with device-only accessibility.
- Face ID, Touch ID, or Android strong biometric unlock is optional and uses no device-credential fallback.
- Biometric templates and PIN material never leave the device.
- Supported auto-lock periods are immediate, 1 minute, 5 minutes, and 15 minutes.
- Failed PIN attempts use escalating lockouts.
- Forgotten PIN recovery clears the authenticated app session and requires account authentication.
- Secure-storage initialization errors fail closed and keep authenticated content covered.
- User changes cannot expose the next user's content during lock initialization.

### Mobile Privacy

- Authenticated content is covered while the app lock is active or initializing.
- App-switcher privacy is enforced through screen-capture protection.
- Notification channels use private lock-screen visibility.
- Push notifications use a generic title and do not include event content in the OS preview.
- Full notification content remains available only inside the authenticated application.

### Server-Side Audit Boundary

- Added an authenticated mobile app-lock audit endpoint.
- Event names and details are strict allowlists.
- Audit context is resolved from the authenticated user, company, device, and session.
- The endpoint rejects client-supplied PINs, PIN hashes, salts, and biometric data by schema design.
- Rate limiting is applied before security-event persistence.

## Automated Evidence

The following checks passed in this workspace:

- Root TypeScript typecheck
- Mobile TypeScript typecheck
- ESLint
- Next.js production build (251 routes/pages)
- Prisma generation and validation from the existing acceptance workflow
- Mobile app-lock tests: 38 checks
- Optional MFA tests: 20 checks
- Enterprise MFA tests
- Mobile dashboard security tests
- Stable-core regression tests
- Mobile authentication and session-persistence tests
- Message pipeline and continuous-delivery tests
- Delete-for-Everyone tests
- Contact, category-contact, plan, phone-number, and attribution tests
- Privacy, consent, retention, export, and deletion tests
- Notification tests: 97 events
- Monitoring health, alert, failure-simulation, and load tests
- Localization validation for 10 dictionaries
- Expo Doctor: 17/17 checks
- Repository secret scan: 1,176 tracked files, no findings

The release acceptance workflow completed its automated sections but intentionally blocked on missing external evidence. No acceptance flags were forged or bypassed.

## Android Bundle Evidence

Validation artifact:

`apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`

- Package: `com.logivya.mobile`
- Version code: `142`
- Version name: `1.0.112`
- Size: `60,943,460` bytes
- SHA-256: `44AEC5687C2665338B40EE96BD688432E5A7574AD397BC28108902C3B9227345`
- Upload certificate SHA-256: `90:ED:68:41:02:50:0A:91:50:46:DF:80:4E:9D:B4:04:CA:61:39:58:19:DC:8D:D0:25:AC:08:5D:71:FA:6B:A0`
- Minimum SDK: 24
- Target and compile SDK: 36
- ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- Cleartext traffic: disabled
- Android backup: disabled
- Debuggable: false
- Forbidden storage and advertising permissions: absent
- Embedded production endpoint: `https://www.logivya.com`
- Embedded-secret scan: passed
- Bundletool validation: passed with pinned bundletool 1.18.1
- JAR signature verification: passed

Machine-readable evidence:

`artifacts/releases/android-v142-release-manifest.json`

Version code 142 has already been used in the stores. This artifact is therefore validation evidence, not a new upload candidate. The next store candidate must use a unique higher version code, normally 143, after the release gates pass.

Local Android validation disabled Sentry source-map upload because no local `SENTRY_AUTH_TOKEN` was available. This did not disable runtime Sentry, but production CI must prove the source-map upload separately.

## iOS Evidence

- App Store Connect API environment validation passed.
- Bundle identifier: `com.logivya.mobile`.
- Apple team: `YMW24BAWTV`.
- App Store Connect app ID: `6792539737`.
- API private key is referenced outside the repository and parsed as an EC key.
- EAS production profile validation passed all 16 automated checks.
- ATS, notifications, background modes, Firebase, device build, icon, and identity checks passed.
- Uploaded build 142 is valid and unexpired.
- App Store version 1.0 remains `PREPARE_FOR_SUBMISSION`.

Build 142 is already present in App Store Connect. A new iOS candidate also requires a unique build number, normally 143, after the release gates pass.

## Mandatory Outstanding Gates

1. Real Android device acceptance for register, login, logout, MFA, lock/unlock, background/foreground, notification privacy, WhatsApp connect, group/contact sync, message send, history, and Delete for Everyone.
2. Real iPhone acceptance for the same flows, including Face ID/Touch ID, forgotten PIN, and TestFlight update behavior.
3. Authenticated mobile-web smoke test in production.
4. Authenticated desktop-web smoke test in production.
5. Production worker and Redis heartbeat, queue recovery, retry, and restart evidence.
6. Target production database migration status, ownership/isolation audit, and backup/restore evidence.
7. Google Play signing lineage and installed-version update test from the current published build to the next candidate.
8. App Store Connect App Privacy answers and legal disclosures reviewed against the actual implementation.
9. Apple agreements, tax, and banking state confirmed where applicable.
10. Production Sentry source-map upload proven in CI without exposing the token.

## Stable-Core Impact

The protected WhatsApp pairing, session restoration, group synchronization, queue, worker delivery, message sending, history, and Delete-for-Everyone implementation was not modified for this PRD. Stable-core automated regression checks passed, but real-device and production-worker evidence is still required.

## Final Release Position

The PRD implementation and local build evidence are complete enough for controlled acceptance testing. They are not sufficient for an honest production release decision. Do not upload a new v143 Android or iOS candidate until the mandatory gates above are completed and recorded.

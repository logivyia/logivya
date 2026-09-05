# Security Page Simplification Report

Date: 2026-07-23

## 1. Repository audit summary

The customer Security experience is implemented by a web component and a shared
Expo/React Native screen used by Android and iOS. The audit also covered MFA
status endpoints, session and recovery-code endpoints, the internal MFA policy
engine, mobile API wrappers, logout flows, app-lock controls, localization
references, and security regression scripts.

This change is intentionally limited to the customer-facing Security page. It
does not modify the protected WhatsApp/message core, message queues, workers,
WhatsApp sessions, group synchronization, or message deletion.

## 2. Web Security page architecture

The web Security page is implemented in
`src/components/security-settings-page.tsx`. It loads the customer MFA status
from `/api/auth/mfa/status` and renders login-security, authenticator, email
verification, and preferred-method controls.

The page no longer imports, mounts, or renders customer session management,
logout-everywhere, recovery-code management, company security policy, or
security activity controls.

## 3. Mobile Security screen architecture

Android and iOS share
`apps/mobile/src/screens/app/security-screen.tsx`. The screen loads the
minimized mobile MFA status through `apps/mobile/src/api/mfa-api.ts`.

Authenticator, email verification, preferred MFA method, PIN, biometrics,
application lock, and screen-capture protection remain available where
supported.

## 4. Active Sessions components removed

The following customer-facing behavior was removed from both web and shared
mobile Security screens:

- Active Sessions heading, list, loading/error/empty states, and session cards
- Current-session labels and browser/device/IP/date metadata
- Individual session revoke actions
- Logout-everywhere action
- Session pagination and session refresh behavior

No blank card or reserved layout gap remains.

## 5. Recovery Codes components removed

The persistent Recovery Codes management area was removed from both customer
screens, including remaining-count metadata, password fields, regeneration,
copy/download controls, lists, loading states, and error states.

Recovery codes generated during new TOTP enrollment are still shown once in the
enrollment completion flow. They are not mounted or exposed during ordinary
Security page loads.

## 6. Queries and hooks removed

The customer Security screens no longer call session-list or recovery-code
metadata endpoints. Their initial data load now makes only the MFA status
request required by visible controls.

The customer MFA status responses were minimized so they no longer contain
session details, trusted-device details, recovery-code counts, policy internals,
or recent security events.

## 7. APIs preserved, restricted, or deprecated

Option A was selected: authenticated session and recovery-code APIs remain for
security enforcement, incident response, compatibility, and possible internal
use, while customer Security screens no longer navigate to or call them.

Web endpoints continue to require an authenticated API session. Mobile
endpoints continue to require mobile authentication. Recovery-code
regeneration retains password confirmation, rate limiting, and MFA protection.
No endpoint was made anonymous and no authorization rule was weakened.

## 8. Recovery-code compatibility decision

Existing hashed recovery codes remain valid and are not regenerated or
invalidated by this UI change. Login-time recovery-code verification and
single-use consumption remain enabled.

New TOTP enrollment follows policy A: recovery codes are generated and shown
once as part of enrollment completion. This preserves an emergency recovery
path without restoring the persistent customer management card.

## 9. Standard logout validation

The existing web header/menu logout and mobile profile/settings logout flows
remain unchanged. Current-session token revocation and local secure credential
cleanup were not removed. Static routing and authentication regression tests
passed.

## 10. TOTP validation

TOTP setup, verification, preferred-method selection, and login-time MFA
verification remain wired. Enterprise and optional MFA regression suites
passed, including the one-time recovery-code enrollment contract.

## 11. Email OTP validation

Email verification and email OTP remain visible and operational in the
customer UI. Optional and enterprise MFA regression suites passed.

## 12. Application-lock validation

The shared mobile screen retains application PIN, Face ID/Touch ID or Android
biometric behavior, app lock, and screen-capture protection. The mobile app-lock
suite passed 38 checks.

## 13. Localization cleanup

Removed customer-screen copy is no longer referenced by the web or mobile
Security screen. Localization entries needed by login recovery, internal/admin
security tools, or backend event identifiers were retained to avoid breaking
valid recovery and support paths. No new untranslated fallback key was added.

## 14. Accessibility validation

Removed controls were deleted from the component trees rather than hidden with
CSS or opacity. Their inputs, focus targets, touch targets, labels, hints, and
loading states therefore do not exist in the customer DOM or native
accessibility tree. Remaining forms retain their existing labels and heading
structure.

Automated source-contract checks passed. A physical-device screen-reader and
authenticated browser accessibility-tree pass is still required before store
release.

## 15. Performance improvement

Opening Security now avoids session-list, recovery-code count, recovery-code
metadata, trusted-device, policy-detail, and security-event payloads. There is
no hidden polling for the removed sections. The customer page performs one
bounded MFA status request for its visible configuration controls.

## 16. Tests added

`scripts/test-security-ui-cleanup.ts` proves that removed UI, handlers, and
network calls are absent while enrollment-only recovery codes and backend
security contracts remain.

`scripts/test-optional-mfa-policy.ts` was updated to assert the minimized
customer MFA status contract.

## 17. Commands executed

- `npm run test:security-ui-cleanup`
- `npm run test:optional-mfa`
- `npm run test:enterprise-mfa`
- `npm run test:mobile-app-lock`
- `npm run test:web-auth-routing`
- `npm run test:password-policy`
- `npm run test:stable-core`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run typecheck` in `apps/mobile`
- Android `:app:bundleRelease` validation with local Sentry upload disabled
  and `arm64-v8a`
- Expo production export for iOS
- Static forbidden-reference scan of both customer Security screens
- `git diff --check`

## 18. Build results

All listed security, authentication, app-lock, stable-core, typecheck, lint, and
web production-build checks passed. Next.js 16.2.9 compiled successfully and
generated 251 static pages.

The Android release bundle task passed locally for `arm64-v8a` after disabling
Sentry upload only for local validation. The production iOS JavaScript/Hermes
export passed with 2,164 modules and 36 assets.

These are build validations, not signed store-release artifacts.

## 19. Remaining risks

- Manual role/plan QA is still required for Trial, Starter, Professional,
  owner, admin, and member accounts.
- Authenticated browser network inspection, DOM/accessibility-tree inspection,
  and cached-production HTML validation have not been completed on a deployed
  build.
- Physical Android and iPhone verification is still required for logout, TOTP,
  email OTP, PIN, biometrics, and layout behavior.
- A full multi-ABI Android build was not produced on this Windows machine; the
  all-device store bundle must be built in Linux/EAS CI.
- Native iOS signing/archive validation requires EAS or macOS/Xcode.
- Release CI must contain a valid Sentry auth token if source-map upload is a
  mandatory release step.
- The repository contains unrelated pre-existing changes. Release changes must
  be isolated and reviewed before deployment.

## 20. Store release requirement

Shared native mobile code changed, so Android and iOS require new store builds.
The next unique Android `versionCode` and iOS `buildNumber` must be 146 or
higher; the current 145 build must not be reused.

No AAB, IPA, Play Console upload, TestFlight upload, or production deployment
was performed as part of this validation. Store artifacts should be generated
only after the remaining manual/device gates pass.

## 21. Final GO or NO-GO decision

**Implementation and automated regression gate: GO.**

The requested customer UI and data-minimization change is implemented and all
available automated checks pass without changing the protected
WhatsApp/message core.

**Production/store release gate: NO-GO.**

Release remains blocked until authenticated browser inspection, the role/plan
matrix, physical Android/iPhone security-flow QA, a full multi-ABI Android
release build, and a signed native iOS archive succeed. This distinction avoids
claiming production readiness based only on compilation.

# Logivya Mobile Fix List

Audit date: 2026-06-16

Priority definitions:

- P0: Blocks first Android APK release or makes a claimed critical flow unusable.
- P1: High-risk production issue that should be fixed before closed beta.
- P2: Important hardening/polish that can be fixed during beta if tracked.
- P3: Non-blocking polish, documentation, or enhancement.

## P0 - Android Release Blockers

| ID | Issue | Evidence | Required Fix | Owner Area |
| --- | --- | --- | --- | --- |
| P0-01 | Firebase Android config is missing | `apps/mobile/google-services.json` does not exist | Add real Firebase `google-services.json` for package `com.logivya.mobile` | Mobile release |
| P0-02 | EAS project ID is empty | `extra.eas.projectId` resolves to empty string | Set `EXPO_PUBLIC_EAS_PROJECT_ID` or add real project ID to app config | Mobile release |
| P0-03 | No installable Android APK has been produced | No APK/AAB artifact validated in repo docs | Run `eas build --platform android --profile preview` after Firebase/EAS setup | Mobile release |
| P0-04 | Real Android device UAT is not completed | No device test result exists | Install preview APK and complete `docs/ANDROID_REAL_DEVICE_TEST_PLAN.md` | QA |
| P0-05 | Messaging tab is a placeholder | `apps/mobile/src/screens/app/messaging-screen.tsx` renders `PlaceholderCard` | Wire send/schedule/history UI to existing mobile message APIs or remove from release scope | Mobile product |
| P0-06 | Message History screen is missing | `apps/mobile/src/screens/app/message-history-screen.tsx` does not exist | Add mobile message history route/screen or remove claim from release scope | Mobile product |

## P1 - Pre-Beta High Risk

| ID | Issue | Evidence | Required Fix | Owner Area |
| --- | --- | --- | --- | --- |
| P1-01 | Mobile package has no lint script | `npm run lint` fails in `apps/mobile` | Add package-level lint script or document root lint as official mobile lint gate | Mobile quality |
| P1-02 | Register screen auto-accepts legal consents | `acceptTerms`, `acceptPrivacy`, `acceptKvkk` are submitted as `true` | Add visible consent controls before production registration | Auth/legal |
| P1-03 | Password reset production flow needs real device/email UAT | Flow is wired but not verified on device | Test Resend delivery, code expiry, reuse prevention, and login with new password | Auth |
| P1-04 | WhatsApp QR/phone pairing needs production provider UAT | Polling and screens exist, but real provider success not certified in mobile | Test QR and phone-code connection on Android device | WhatsApp |
| P1-05 | Push notification delivery cannot be verified | Firebase files and EAS project ID missing | After Firebase setup, test token registration and foreground/background push delivery | Notifications |
| P1-06 | Deep links are incomplete | Linking config omits category detail, company settings, feedback, reset code variants, message history detail | Expand linking map and test each route | Navigation |
| P1-07 | Raw backend errors may be visible | WhatsApp card renders `account.lastError`; API errors are shown directly in places | Map backend errors to localized user-safe messages | UX/security |
| P1-08 | Auth and store strings contain hardcoded Turkish and encoding artifacts | Multiple screens/stores show mojibake and hardcoded labels | Move to i18n keys and normalize source encoding | Localization |
| P1-09 | Sentry is configured but inactive by default | `sentryDsn` is empty | Configure `EXPO_PUBLIC_SENTRY_DSN` for staging/production | Observability |

## P2 - Release Hardening

| ID | Issue | Evidence | Required Fix | Owner Area |
| --- | --- | --- | --- | --- |
| P2-01 | Offline UX is not explicit | NetInfo and query persistence exist, but no global offline banner | Add user-visible offline state and retry copy | UX |
| P2-02 | API runtime schema validation is missing | TypeScript types exist, but no runtime response parser | Add lightweight response guards for critical endpoints | API quality |
| P2-03 | Company settings are read-only and incomplete | Screen shows most values as not provided | Add or wire company profile/billing API if mobile settings are in MVP | Profile/company |
| P2-04 | Profile edit and password change are missing | Profile screen displays an API-missing notice | Add or wire profile update and password change APIs if in MVP | Profile |
| P2-05 | Notification detail is basic | Notification opens an alert only | Add route-aware notification detail/action handling | Notifications |
| P2-06 | Pagination is partial in groups/support UI | APIs expose page info, but UI mainly loads fixed limits | Add load-more behavior where needed | UX/API |
| P2-07 | Static colors need dark-mode contrast pass | Some chips/pills use fixed colors | Review all status colors in dark mode | Design QA |

## P3 - Polish and Operational Follow-Up

| ID | Issue | Required Fix |
| --- | --- | --- |
| P3-01 | Store screenshots and feature graphic are not final | Prepare Google Play/App Store visual assets. |
| P3-02 | Analytics event taxonomy needs final review | Define naming convention for login, WhatsApp, messaging, support, subscription events. |
| P3-03 | In-app feedback screenshot attachment is URL-only | Add native screenshot/file attachment later if required. |
| P3-04 | Biometric login is architecture-only | Add actual biometric prompt after beta if product wants it. |
| P3-05 | App version policy needs production values | Set minimum/recommended versions after first build number is fixed. |

## Exact Next Phase

**Phase 19: Android Build Unblock and P0 Mobile Flow Completion**

Exit criteria:

1. Firebase Android config is present.
2. EAS project ID is present.
3. Preview APK build succeeds.
4. App installs on a physical Android phone.
5. Login, logout, WhatsApp account list, QR/phone connection screens, groups, categories, support, notifications, subscription, and settings are smoke-tested.
6. Messaging and message history are either implemented or explicitly removed from the first closed beta scope.


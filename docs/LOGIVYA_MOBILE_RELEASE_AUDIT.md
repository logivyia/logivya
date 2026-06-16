# Logivya Mobile Release Audit

Audit date: 2026-06-16

Scope: Phase 18 pre-release validation for the existing Logivya mobile application. This audit reviews the current `apps/mobile` codebase only. No new features, screens, or UI redesigns were implemented.

## Executive Summary

The mobile application has a strong foundation: React Native + Expo, strict TypeScript, token-based authentication, SecureStore token storage, central API client, persisted React Query cache, nested navigation, theming, i18n infrastructure, push notification scaffolding, Sentry/analytics hooks, WhatsApp connection flows, groups, categories, support, notifications, profile, settings, feedback, and subscription display.

It is not yet ready for first Android release because several release-blocking items remain: Firebase config files are missing, EAS project ID is empty, no installable APK/AAB has been produced, real device testing has not been completed, and the mobile Messaging tab is still a placeholder even though backend message endpoints exist.

## Readiness Scores

| Area | Score | Notes |
| --- | ---: | --- |
| Mobile completion | 78% | Most modules exist, but messaging/history and edit flows are incomplete. |
| Production readiness | 68% | Architecture is solid, but release credentials/config and real-device validation are missing. |
| Release readiness | 58% | APK release is blocked by Firebase/EAS gaps and untested critical flows. |
| Android readiness | 62% | Package/config exists, but no Firebase files, no EAS project ID, no APK artifact. |
| iOS readiness | 45% | Bundle config exists, but iOS Firebase file and TestFlight validation are missing. |

## Commands Run

| Command | Result |
| --- | --- |
| `npm.cmd run typecheck` in `apps/mobile` | Passed |
| `npm.cmd run lint` in `apps/mobile` | Failed: no `lint` script exists in mobile package |
| `npm.cmd run lint` at repository root | Passed |
| `npx.cmd expo config --json` in `apps/mobile` | Passed |
| Firebase file checks | `google-services.json`: missing, `GoogleService-Info.plist`: missing |

## CTO-Level Validation Matrix

| Validation Area | Status | Release Risk |
| --- | --- | --- |
| Mobile navigation | Mostly ready | Medium |
| Screen routing | Mostly ready | Medium |
| Deep links | Partial | High |
| Authentication flow | Ready pending UAT | Medium |
| Token refresh flow | Ready pending UAT | Medium |
| Logout flow | Ready | Low |
| Session persistence | Ready | Low |
| API integrations | Partial | High |
| Error handling | Partial | Medium |
| Offline handling | Partial | Medium |
| Secure storage usage | Ready | Low |
| Push notification architecture | Partial | High |
| WhatsApp connection flow | Implemented, unverified on device | High |
| Subscription flow | Display ready | Medium |
| Support flow | Mostly ready | Medium |
| Profile flow | Read-only/partial | Medium |
| Settings flow | Mostly ready | Low |
| Dark mode consistency | Mostly ready | Medium |
| Translation consistency | Partial | Medium |
| API response consistency | Partial | Medium |

## Architecture Review

### Strengths

- `expo-secure-store` is used for access tokens, refresh tokens, token expirations, and device ID.
- Central API client injects access tokens, refreshes tokens before expiry, retries network failures, times out requests, and logs important API failures to analytics/crash reporting.
- Logout cleanup clears secure storage, React Query cache, and Zustand stores.
- React Query persistence and NetInfo integration provide a real offline cache foundation.
- App-level error boundary and optional Sentry wrapper exist.
- Expo deep linking is configured with `logivya://` and `https://www.logivya.com`.
- Theme and language stores exist and drive navigation labels and most screens.
- WhatsApp QR and phone code flows include polling and expiry handling.

### Weaknesses

- `apps/mobile/google-services.json` and `apps/mobile/GoogleService-Info.plist` are missing.
- `extra.eas.projectId` is empty. Expo push token registration can fail without a real EAS project ID.
- `apps/mobile` has no `lint` script, so mobile lint is not a direct package-level quality gate.
- `MessagingScreen` is still a placeholder and does not call `/api/mobile/messages/send`, `/schedule`, or `/history`.
- No `MessageHistoryScreen` exists in mobile navigation.
- Deep links omit Category Detail, Company Settings, Feedback, and some reset-password token/code variants.
- Several auth screens still include hardcoded Turkish strings and mojibake/encoding artifacts in source text.
- Company settings and profile editing are intentionally read-only because mobile edit APIs are missing or not wired.
- Push notifications are architected but cannot be production-tested without Firebase config and EAS project ID.
- Sentry DSN is empty by default, so production crash reporting is not active unless env is configured.

## Screen-by-Screen Release Review

| Screen | Status | Missing Functionality | UI Issues | API Issues | Security Issues | Release Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Splash | Ready | None critical | Text contains encoding artifacts in source | None | None | Low |
| Login | Mostly ready | Real-device login UAT | Hardcoded Turkish alert strings; encoding artifacts | Uses mobile login API | None found | Medium |
| Register | Mostly ready | Terms/privacy UI is not explicitly shown in mobile form | Hardcoded labels and encoding artifacts | Uses mobile register API | Accept flags are submitted as always true | High |
| Forgot Password | Mostly ready | Production email delivery UAT | Hardcoded alert strings | Uses mobile forgot password API | Does not reveal account existence, depends backend | High |
| Reset Password | Mostly ready | Deep link token/code support incomplete | Hardcoded labels and encoding artifacts | Uses mobile reset password API | Needs brute-force/expiry UAT | High |
| Dashboard | Mostly ready | None critical | Greeting hardcoded Turkish | Uses bootstrap and message history APIs | None found | Medium |
| WhatsApp Accounts | Mostly ready | Real provider UAT | Backend `lastError` shown raw to user | Uses account list/actions APIs | Raw backend errors may expose implementation details | High |
| WhatsApp QR | Mostly ready | Real QR scan UAT | Checkmark glyph encoding artifact | Uses QR/session/status APIs | Polling should be real-device tested | High |
| WhatsApp Phone Connect | Mostly ready | Real phone-code pairing UAT | Checkmark glyph encoding artifact | Uses phone-code/status APIs | Phone normalization is local; provider validation still required | High |
| Groups | Mostly ready | Pagination not surfaced beyond first 100 | Some static status colors are not theme-derived | Uses groups API; account/category filters are client-side | None found | Medium |
| Categories | Mostly ready | None critical | Success/error strings in store are hardcoded Turkish | Uses category CRUD/assignment API | Delete has confirmation | Medium |
| Category Detail | Mostly ready | None critical | Checkmark glyph encoding artifact | Uses group/category APIs | None found | Medium |
| Messaging | Not release ready | Send now, schedule, recurring, history UI not implemented | Placeholder screen only | Backend APIs exist but mobile screen does not use them | Sending authorization not exercised by app | Critical |
| Message History | Missing | No screen exists | N/A | Backend history API exists | N/A | Critical |
| Support List | Mostly ready | Pagination not fully exposed in UI | Type labels can show raw backend type | Uses support ticket list API | None found | Medium |
| Create Ticket | Mostly ready | Close ticket unsupported | Good enough | Uses create ticket API | No priority field, as required | Medium |
| Ticket Detail | Mostly ready | Close/reopen unsupported | Raw ticket type shown | Uses detail/reply APIs | None found | Medium |
| Notifications | Partially ready | Push/open-action navigation not fully connected in UI | Alert detail is basic | Uses list/read/read-all APIs | Notification payload handling needs review | High |
| Profile | Partial | Edit profile and change password missing | Notice explains missing API | Uses auth/me data from store/API | Logout clears state | Medium |
| Company Settings | Partial | Editing missing; most fields unavailable | Read-only notice present | Company API returns limited data | None found | Medium |
| Subscription | Display ready | Upgrade/payment flow intentionally absent | Upgrade button is inert | Uses subscription status API | None found | Medium |
| Settings | Mostly ready | Notification toggle does not request/register token by itself | Some hardcoded labels | Store-backed theme/language | Logout available | Medium |
| Feedback | Mostly ready | Native screenshot capture not implemented, only URL field | Placeholder URL text | Uses feedback API | Device metadata is sent; privacy copy must disclose it | Medium |

## API Contract Review

### Usable Mobile APIs

- `POST /api/mobile/auth/login`
- `POST /api/mobile/auth/register`
- `POST /api/mobile/auth/forgot-password`
- `POST /api/mobile/auth/reset-password`
- `GET /api/mobile/auth/me`
- `POST /api/mobile/auth/logout`
- `GET /api/mobile/bootstrap`
- `GET /api/mobile/whatsapp/accounts`
- `POST /api/mobile/whatsapp/accounts/qr`
- `POST /api/mobile/whatsapp/accounts/phone-code`
- `GET /api/mobile/whatsapp/accounts/:id/status`
- `POST /api/mobile/whatsapp/accounts/:id/reconnect`
- `POST /api/mobile/whatsapp/accounts/:id/archive`
- `DELETE /api/mobile/whatsapp/accounts/:id`
- `GET /api/mobile/groups`
- `GET /api/mobile/categories`
- `POST /api/mobile/categories`
- `PATCH /api/mobile/categories/:id`
- `DELETE /api/mobile/categories/:id`
- `POST /api/mobile/messages/send`
- `POST /api/mobile/messages/schedule`
- `GET /api/mobile/messages/history`
- `GET /api/mobile/messages/history/:id`
- `GET /api/mobile/support/tickets`
- `POST /api/mobile/support/tickets`
- `GET /api/mobile/support/tickets/:id`
- `POST /api/mobile/support/tickets/:id/messages`
- `GET /api/mobile/notifications`
- `GET /api/mobile/notifications/unread-count`
- `POST /api/mobile/notifications/read`
- `POST /api/mobile/notifications/read-all`
- `POST /api/mobile/push/register`
- `DELETE /api/mobile/push/register`
- `GET /api/mobile/subscription/status`
- `POST /api/mobile/feedback`
- `GET /api/mobile/app-version`

### API Gaps

- Mobile profile update API is not wired.
- Mobile password change API is not wired.
- Mobile company settings update API is not wired.
- Messaging APIs exist, but mobile UI/store does not use them.
- Message history API exists, but no mobile screen is wired.
- Notification click actions are defined in service code, but app navigation integration needs real-device validation.
- API responses are typed in TypeScript, but runtime schema validation is not applied on mobile responses.

## Deep Link Review

Configured prefixes:

- `logivya://`
- `https://www.logivya.com`

Configured routes cover auth, dashboard, WhatsApp accounts/QR/phone code, messaging, support ticket routes, notifications, subscription, and settings.

Missing or incomplete:

- Category detail deep link.
- Company settings deep link.
- Feedback deep link.
- Reset password code/token handling beyond `identifier`.
- Message history detail deep link.

## Security Review

### Good

- Access and refresh tokens are stored in SecureStore, not AsyncStorage.
- Device ID is stored in SecureStore.
- API client logs out on invalid refresh.
- Logout clears tokens and cached stores.
- Authenticated endpoints use bearer tokens.
- Destructive category and WhatsApp actions use confirmation prompts.

### Risks

- Register screen submits terms/privacy/KVKK acceptance as always true without visible checkboxes in mobile.
- Raw backend error messages can appear in WhatsApp account cards and API error UI.
- Production Sentry is inactive unless DSN is configured.
- Push token registration cannot be validated until Firebase/EAS setup is complete.
- Runtime API schema validation is missing.

## Offline and Recovery Review

React Query cache persistence and NetInfo online state are configured. The app can cache query data and retry failed queries. However, there is no clear global offline banner or per-screen offline messaging strategy. This is not a first-install blocker, but it is a P2 release hardening item.

## Dark Mode and Translation Review

Dark/light theme support is present through `ThemeProvider` and `settingsStore`. Most UI components consume theme colors. Translation infrastructure exists for Turkish and English.

Issues:

- Several auth strings are hardcoded Turkish.
- Some store success/error messages are hardcoded Turkish.
- Encoding artifacts appear in several source strings (`Å`, `Ä`, `Ã`), which can surface in UI depending on build/source encoding.
- Static status colors in some screens should be reviewed for dark mode contrast.

## Android Release Blockers

1. `google-services.json` is missing.
2. `extra.eas.projectId` is empty.
3. No installable APK has been generated.
4. No real Android device UAT has been completed.
5. Messaging and message history are not implemented in mobile UI.
6. Mobile package has no `lint` script.

## Remaining Work Estimate

- P0 release blockers: 1-2 engineering days after Firebase/EAS credentials are available.
- P1 reliability and localization hardening: 2-4 engineering days.
- Full closed beta readiness with real devices: 3-5 calendar days depending on tester availability.

## Exact Next Engineering Phase

Phase 19 should be: **Android Build Unblock and P0 Mobile Flow Completion**.

Recommended scope:

1. Add real Firebase config files and EAS project ID.
2. Generate preview APK with EAS.
3. Implement mobile messaging and message history against existing backend APIs.
4. Add mobile package `lint` script.
5. Localize hardcoded auth/store strings and fix encoding artifacts.
6. Run real Android device UAT.


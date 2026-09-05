# Logivya Mobile Production Readiness

Date: 2026-06-15
Scope: Phase 8 production readiness for `apps/mobile`.

## Readiness Summary

| Area | Readiness | Status |
| --- | ---: | --- |
| Overall mobile production readiness | 78% | Production foundation is in place, store credentials still missing |
| Android readiness | 76% | FCM/Google config file required before EAS production build |
| iOS readiness | 72% | Apple push, Google plist, and App Store metadata required |
| Push notifications | 75% | Permission, token registration, foreground/background/open handlers added |
| Deep linking | 80% | `logivya://` scheme and main route mapping added |
| App branding | 82% | Icon, adaptive icon, splash references exist |
| Offline layer | 78% | React Query persistence and network state tracking added |
| Analytics | 70% | Firebase Analytics wrapper and screen tracking added, native config still required |
| Crash reporting | 75% | Sentry wrapper and global error boundary added, DSN still required |
| Security hardening | 82% | Secure storage/session cleanup reviewed and preserved |
| Build readiness | 80% | Mobile typecheck and Expo config pass |

## Completed Work

### Push Notifications

Implemented:

- Added Expo Notifications.
- Added Expo Device.
- Added Expo Task Manager.
- Added notification permission request flow.
- Added push token registration through existing `/api/mobile/notifications/register-token`.
- Added Android notification channel.
- Added foreground notification handler.
- Added background notification task.
- Added notification open action handling.
- Added event tracking for permission denied, token registered, foreground received, background received, and opened.

Important note:

- This uses Expo Notifications with Firebase-backed Android delivery.
- Production delivery still requires Firebase project credentials and backend send implementation.

### Deep Linking

Implemented:

- `logivya://` scheme already exists and was wired into React Navigation.
- HTTPS prefix added for `https://www.logivya.com`.
- Routes configured for:
  - login
  - register
  - forgot password
  - reset password
  - dashboard
  - WhatsApp accounts
  - WhatsApp QR
  - WhatsApp phone code
  - messaging
  - support tickets
  - support ticket detail
  - profile
  - notifications
  - subscription
  - settings

### App Branding

Verified:

- App icon: `apps/mobile/assets/icons/icon.png`
- Splash: `apps/mobile/assets/splash/splash-icon.png`
- Logo image: `apps/mobile/assets/images/logo.png`
- Android adaptive icon configured.
- Splash background configured as dark navy.
- `userInterfaceStyle` is `automatic`.

Missing before release:

- Validate icon dimensions for Play Store and App Store.
- Add final store listing graphics.
- Add dark mode splash asset variant if brand wants separate artwork.

### Offline Layer

Implemented:

- Added React Query.
- Added React Query persistence.
- Added AsyncStorage query cache persister.
- Added NetInfo online/offline detection.
- Added retry strategy.
- Added reconnect refetch behavior.

Note:

- Existing business screens still primarily use Zustand stores. React Query is now available as the production data layer for new or migrated screens.

### Analytics

Implemented:

- Added Firebase Analytics dependency.
- Added safe analytics wrapper.
- Added screen tracking from React Navigation state changes.
- Added event tracking helper.

Production requirement:

- Firebase native config must be added:
  - `apps/mobile/google-services.json`
  - `apps/mobile/GoogleService-Info.plist`

### Crash Reporting

Implemented:

- Added Sentry React Native dependency.
- Added Sentry Expo plugin.
- Added safe Sentry initialization.
- Added global error boundary.
- Added API/runtime error capture helper.
- Added authenticated user context for crash reports.

Production requirement:

- Set `extra.sentryDsn` or inject it through the build environment before release.

### Security Hardening

Reviewed and preserved:

- Access and refresh tokens use `expo-secure-store`.
- Tokens are not stored in AsyncStorage.
- Logout revokes the mobile session and clears stores.
- Refresh flow is centralized in the API client.
- Invalid refresh forces local logout.
- Push registration only runs after authenticated session.

Fixed:

- Mobile register payload now matches `/api/mobile/auth/register`.
- Password confirmation is sent to backend.

### Build Readiness

Implemented:

- Added `apps/mobile/eas.json`.
- Added Android package id.
- Added iOS bundle id.
- Added Google service file references.
- Added notification permission config.
- Added Sentry Expo plugin.
- Fixed root TypeScript boundary so root Next build no longer typechecks `apps/mobile`.
- Fixed root ESLint boundary so web lint no longer scans Expo mobile files.

## Files Changed

Production readiness files:

- `apps/mobile/App.tsx`
- `apps/mobile/app.json`
- `apps/mobile/eas.json`
- `apps/mobile/package.json`
- `apps/mobile/package-lock.json`
- `apps/mobile/src/components/error-boundary.tsx`
- `apps/mobile/src/constants/config.ts`
- `apps/mobile/src/hooks/use-production-services.ts`
- `apps/mobile/src/navigation/linking.ts`
- `apps/mobile/src/services/analytics.ts`
- `apps/mobile/src/services/crash-reporting.ts`
- `apps/mobile/src/services/notifications.ts`
- `apps/mobile/src/services/offline-query.tsx`

Production blocker fixes:

- `apps/mobile/src/api/auth-api.ts`
- `apps/mobile/src/auth/auth-service.ts`
- `apps/mobile/src/screens/auth/register-screen.tsx`
- `tsconfig.json`
- `eslint.config.mjs`

Documentation:

- `docs/MOBILE_PRODUCTION_READINESS.md`

## Packages Added

- `expo-notifications`
- `expo-device`
- `expo-task-manager`
- `expo-linking`
- `@react-native-community/netinfo`
- `@react-native-async-storage/async-storage`
- `@tanstack/react-query`
- `@tanstack/react-query-persist-client`
- `@tanstack/query-async-storage-persister`
- `@sentry/react-native`
- `@react-native-firebase/app`
- `@react-native-firebase/analytics`

## Validation Results

Passed:

```bash
cd apps/mobile
npm run typecheck
```

Passed:

```bash
cd apps/mobile
EXPO_NO_TELEMETRY=1 npx expo config --type public
```

Passed:

```bash
npm run lint
```

Passed:

```bash
npm run build
```

Known warning:

- `npm install` reports 18 moderate dependency audit findings. These should be reviewed before store release, but they did not block build/typecheck.

## Remaining Blockers

### Android

Required before production EAS build:

1. Create Firebase Android app for package `com.logivya.mobile`.
2. Add `apps/mobile/google-services.json`.
3. Set EAS project id in `app.json` under `extra.eas.projectId`.
4. Configure push notification backend sender.
5. Verify Android 13 notification permission on a physical device.

### iOS

Required before production EAS build:

1. Create Firebase iOS app for bundle id `com.logivya.mobile`.
2. Add `apps/mobile/GoogleService-Info.plist`.
3. Enable Apple Push Notification capability.
4. Configure APNs key/certificate in Firebase or Expo/EAS.
5. Verify notification open actions on physical iPhone.

### Sentry

Required:

1. Create Sentry project.
2. Add real DSN to Expo config/env.
3. Verify source map upload in EAS build.

### Store Metadata

Required:

1. Privacy policy URL.
2. Terms URL.
3. Data safety answers for Google Play.
4. App privacy answers for App Store.
5. Support URL.
6. Marketing screenshots.
7. Final app icon review.
8. Age rating.

### Backend

Required:

1. Implement actual push notification delivery if not already present server-side.
2. Decide whether backend will send via Expo Push API or direct FCM/APNs.
3. Add notification deep link payloads with `url` values.
4. Add mobile notification list/read APIs if Notification Center should show real remote notifications.

## Release Checklist

### Before Internal Testing

- Add Firebase files.
- Add Sentry DSN.
- Add EAS project id.
- Run Android development build.
- Run iOS development build.
- Test login, refresh, logout.
- Test push permission prompt.
- Test foreground notification.
- Test background notification.
- Test notification tap deep link.
- Test reset password deep link.
- Test offline startup with cached data.

### Before Production Store Submission

- Run EAS production builds.
- Verify App Store and Play Store icons.
- Verify splash screen on dark and light devices.
- Verify crash reporting receives test error.
- Verify Firebase Analytics receives screen events.
- Verify no tokens are stored in AsyncStorage.
- Verify logout clears Secure Store.
- Verify privacy disclosures match actual data collection.
- Review `npm audit`.

## Final Recommendation

The mobile app is now production-foundation ready, but not store-release ready until native credentials and live-device tests are completed.

Recommended next phase:

```text
PHASE 9 - Mobile Release Candidate Validation

Add Firebase Android/iOS credential files, configure EAS project id and Sentry DSN, create development builds, test push notifications and deep links on physical Android and iOS devices, then prepare store metadata.
```


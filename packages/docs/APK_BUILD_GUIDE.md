# Logivya Mobile APK and iOS Build Guide

Last updated: 2026-06-15

## Purpose

This guide prepares the Logivya mobile app in `apps/mobile` for Android APK, Android AAB and iOS TestFlight builds.

## Current Build Identity

- App name: `Logivya`
- Expo slug: `logivya-mobile`
- URL scheme: `logivya://`
- Android package: `com.logivya.mobile`
- iOS bundle identifier: `com.logivya.mobile`
- Current app version: `0.1.0`
- Android versionCode default: `1`
- iOS buildNumber default: `1`

## Environment Strategy

The app uses `apps/mobile/app.config.js` and `apps/mobile/eas.json`.

Supported environments:

- `development`
- `staging`
- `production`

Environment variables:

```bash
APP_ENV=development
EXPO_PUBLIC_APP_NAME=Logivya
EXPO_PUBLIC_APP_VERSION=0.1.0
EXPO_PUBLIC_API_BASE_URL=https://www.logivya.com
EXPO_PUBLIC_SENTRY_DSN=
EXPO_PUBLIC_EAS_PROJECT_ID=
EXPO_PUBLIC_EAS_OWNER=logivya
ANDROID_VERSION_CODE=1
IOS_BUILD_NUMBER=1
```

For local development against a local backend:

```bash
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
```

For physical device testing against a local backend, use your computer LAN IP instead of `127.0.0.1`.

Example:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:3000
```

## Required Files Before Real Builds

Android Firebase:

```text
apps/mobile/google-services.json
```

iOS Firebase:

```text
apps/mobile/GoogleService-Info.plist
```

These files are not server secrets, but they must come from the correct Firebase project.

Do not place server keys, database URLs, Resend keys, SMTP credentials or WhatsApp session data in the mobile app.

## Local Validation

From repository root:

```bash
npm install
npm run lint
npm run build
```

From `apps/mobile`:

```bash
npm run typecheck
EXPO_NO_TELEMETRY=1 npx expo config --type public
npx expo-doctor
```

## Local Expo Start

From `apps/mobile`:

```bash
npm run start
```

Android:

```bash
npm run android
```

iOS:

```bash
npm run ios
```

Expo Go may not support every native module used by this app. For Firebase, Sentry and notification testing, use a development build.

## Development Build

```bash
eas build --platform android --profile development
eas build --platform ios --profile development
```

Use this for real-device debugging with native modules.

## Android APK Build

Preview APK:

```bash
eas build --platform android --profile preview
```

The `preview` profile uses:

- Internal distribution
- APK output
- `APP_ENV=staging`
- `EXPO_PUBLIC_API_BASE_URL=https://www.logivya.com`

## Android AAB Build

Production AAB:

```bash
eas build --platform android --profile production
```

The `production` profile uses:

- App bundle output
- Auto increment
- `APP_ENV=production`
- `EXPO_PUBLIC_API_BASE_URL=https://www.logivya.com`

## iOS Build

Preview/TestFlight build:

```bash
eas build --platform ios --profile preview
```

Production build:

```bash
eas build --platform ios --profile production
```

Submit:

```bash
eas submit --platform ios --profile production
```

## Deep Link Validation

Expected links:

```text
logivya://login
logivya://reset-password
logivya://support
logivya://support/tickets/:ticketId
logivya://profile/subscription
logivya://whatsapp/accounts
logivya://messages
```

## Push Notification Validation

Required notification event types:

- `whatsapp_disconnected`
- `whatsapp_connected`
- `subscription_expiring`
- `subscription_expired`
- `support_ticket_update`
- `campaign_completed`
- `campaign_failed`

If a push payload includes `url`, the app opens it directly.

If `url` is missing, the app maps known event types to safe default deep links.

## Android Permissions

Configured:

- `POST_NOTIFICATIONS`

Implicit platform access:

- Internet

Not configured:

- Camera

Camera is intentionally not requested because the current mobile app does not scan QR codes with the device camera.

## iOS Permissions

Configured:

- Remote notification background mode

Not configured:

- Camera

Camera is intentionally not requested because the current mobile app does not scan QR codes with the device camera.

## First APK Estimate

If Firebase files and EAS project id are ready:

- First internal APK: 30-60 minutes
- First production AAB candidate: 1-2 hours after APK QA

## First TestFlight Estimate

If Apple Developer access, Firebase iOS file and signing are ready:

- First iOS build: 1-3 hours
- First TestFlight availability: usually 1-24 hours depending on Apple processing

## Known Blockers

- `google-services.json` is required before real Android Firebase/push validation.
- `GoogleService-Info.plist` is required before real iOS Firebase/push validation.
- `EXPO_PUBLIC_EAS_PROJECT_ID` should be set for production push token generation.
- `EXPO_PUBLIC_SENTRY_DSN` should be set for crash reporting.


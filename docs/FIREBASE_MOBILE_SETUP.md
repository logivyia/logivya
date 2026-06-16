# Logivya Firebase Mobile Setup

Last updated: 2026-06-16  
Scope: Android/iOS Firebase configuration for Logivya Mobile

## Current Status

| Item | Status |
| --- | --- |
| Android package name | `com.logivya.mobile` |
| iOS bundle ID | `com.logivya.mobile` |
| Expo Notifications dependency | Present |
| React Native Firebase app dependency | Present |
| React Native Firebase analytics dependency | Present |
| Android `google-services.json` | Missing |
| iOS `GoogleService-Info.plist` | Missing |
| EAS project ID | Missing/empty |
| FCM real device validation | Not completed |

Do not create fake Firebase configuration files. The files must be downloaded from the real Firebase project.

## Required Firebase Console Steps

### 1. Create Or Open Firebase Project

1. Go to Firebase Console.
2. Create or open the official Logivya Firebase project.
3. Use a clear project name, for example:

```text
Logivya Mobile
```

4. Enable Google Analytics if Firebase asks for it and the business wants mobile analytics.

## Android App Setup

### 2. Add Android App

In Firebase Console:

1. Open Project settings.
2. Select "Add app".
3. Choose Android.
4. Use this Android package name:

```text
com.logivya.mobile
```

5. App nickname:

```text
Logivya Android
```

6. SHA-1 is optional for the current build unless Google Sign-In or phone auth is later added.

### 3. Download Android Config

Download:

```text
google-services.json
```

Place it here:

```text
C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile\google-services.json
```

The current Expo config already points to:

```json
"googleServicesFile": "./google-services.json"
```

## iOS App Setup

### 4. Add iOS App

In Firebase Console:

1. Open Project settings.
2. Select "Add app".
3. Choose iOS.
4. Use this Apple bundle ID:

```text
com.logivya.mobile
```

5. App nickname:

```text
Logivya iOS
```

### 5. Download iOS Config

Download:

```text
GoogleService-Info.plist
```

Place it here:

```text
C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile\GoogleService-Info.plist
```

The current Expo config already points to:

```json
"googleServicesFile": "./GoogleService-Info.plist"
```

## FCM Setup

### 6. Cloud Messaging

In Firebase Console:

1. Open Project settings.
2. Open Cloud Messaging.
3. Confirm Firebase Cloud Messaging API is enabled.
4. For Android, `google-services.json` must belong to `com.logivya.mobile`.
5. For iOS, APNs key/certificate is required before production iOS push delivery.

## Expo Notifications Requirements

The mobile app currently uses:

- `expo-notifications`
- `Notifications.getExpoPushTokenAsync`
- `EXPO_PUBLIC_EAS_PROJECT_ID` through `extra.eas.projectId`

Required before reliable push token generation:

1. Create/link the Expo EAS project.
2. Set a real EAS project ID.
3. Verify this command returns non-empty `extra.eas.projectId`:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
$env:APP_ENV='production'
npx expo config --type public
```

## EAS Project ID Setup

Current problem:

```text
extra.eas.projectId = ""
```

Fix:

1. Login to the correct Expo account.
2. Link or create the EAS project:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
eas init
```

3. Copy the generated project ID.
4. Set it for builds using one of these approaches:

Option A: environment variable in shell/build:

```powershell
$env:EXPO_PUBLIC_EAS_PROJECT_ID="REPLACE_WITH_REAL_EAS_PROJECT_ID"
```

Option B: EAS environment/secrets.

Option C: commit the non-secret project ID into `apps/mobile/app.json` under:

```json
"extra": {
  "eas": {
    "projectId": "REPLACE_WITH_REAL_EAS_PROJECT_ID"
  }
}
```

## Build Readiness Check

After placing Firebase files and setting EAS project ID:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
npm.cmd run typecheck
npx.cmd expo-doctor
$env:APP_ENV='preview'
npx.cmd expo config --type public
```

Expected:

- `googleServicesFile` points to files that exist.
- `extra.eas.projectId` is non-empty.
- Android package is `com.logivya.mobile`.
- API URL is `https://www.logivya.com`.

## First Android APK Build

Use preview first because it creates an APK installable on a real phone:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
eas build --platform android --profile preview
```

After real device testing passes, create the Google Play AAB:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
eas build --platform android --profile production
```

## Security Notes

- Do not commit API keys, passwords, `.env` files, WhatsApp sessions, or private certificates.
- Firebase config files are not the same as secret service account keys, but the team should still decide whether to commit them or inject them through EAS securely.
- Never commit Firebase Admin SDK service account JSON.


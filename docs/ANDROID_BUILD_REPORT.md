# Logivya Android Build Report

Date: 2026-06-15
Phase: 11 - First APK Build, Device Installation and Closed Beta Test
Workspace: `apps/mobile`

## Current Build Summary

The Logivya mobile app is configured for Expo SDK 54 with Android and iOS identifiers ready for pre-production testing.

- App name: Logivya
- Android package: `com.logivya.mobile`
- iOS bundle identifier: `com.logivya.mobile`
- App scheme: `logivya://`
- Version: `0.1.0`
- Android version code: `1`
- iOS build number: `1`
- Default development API base URL: `http://127.0.0.1:3000`
- Preview/staging/production API base URL: `https://www.logivya.com`

## Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm install` | Passed | Root dependencies installed and Prisma generated. npm reported existing audit warnings. |
| `npm run typecheck` | Passed | Run inside `apps/mobile`; TypeScript passed. |
| `npm run lint` | Passed | Root ESLint passed. |
| `npx expo-doctor` | Passed after fixes | SDK-compatible package versions and square icon assets were fixed. |
| `npx expo config --type public` | Passed | Confirmed package name, bundle identifier, scheme, splash, icon, notification and environment config. |
| `npx eas build:configure` | Blocked | EAS requires an authenticated Expo account session in this environment. |
| `adb devices` | Blocked | Android Debug Bridge is not installed or not available in PATH. |

## Expo Doctor Fixes Applied

Expo Doctor initially found APK-blocking issues:

- Non-square icon assets.
- SDK 54 package version mismatches.
- Missing `react-native-worklets` dependency required by `react-native-reanimated`.
- Duplicate Expo native module versions caused by incompatible package versions.

Fixes completed:

- Regenerated `icon.png`, `adaptive-icon.png`, and `notification-icon.png` as 1024x1024 square PNG assets.
- Installed Expo SDK 54-compatible native package versions using `expo install`.
- Added `react-native-worklets@0.5.1`.
- Added Sentry config plugin support for native builds.

Final result: `npx expo-doctor` passes all 18 checks.

## Artifact Status

| Artifact | Status | Reason |
| --- | --- | --- |
| Development APK | Not generated yet | EAS CLI requires Expo login/project authentication. |
| Preview APK | Not generated yet | EAS CLI requires Expo login/project authentication. |
| Production AAB | Not generated yet | EAS CLI requires Expo login/project authentication and Firebase native config files. |

## EAS Build Commands

After Expo/EAS authentication is completed:

```bash
cd apps/mobile
npx eas-cli build --platform android --profile development
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```

Expected artifacts:

- `development`: APK for internal development device testing.
- `preview`: APK for closed beta tester installation.
- `production`: AAB for Google Play Console.

## Physical Android Installation

After a development or preview APK is downloaded:

```bash
adb devices
adb install -r path/to/logivya.apk
```

If `adb` is not available:

1. Install Android Platform Tools.
2. Enable Developer Options on the phone.
3. Enable USB Debugging.
4. Connect the phone and authorize the computer.
5. Run `adb devices` again.

## Native Config Blockers

The following files are still required for fully native Firebase-enabled Android/iOS builds:

- `apps/mobile/google-services.json`
- `apps/mobile/GoogleService-Info.plist`

These files must come from the real Firebase project for Logivya. They must not be guessed or generated with fake credentials.

## Known Warnings

- Root `npm install` reports npm audit warnings. These do not currently block Expo Doctor, but they should be reviewed before store release.
- EAS project ID is empty until the app is linked to an Expo project.
- Physical device testing cannot be completed from this environment until ADB is available and a device is connected.

## Next Fixes

1. Run `npx eas-cli login` or provide `EXPO_TOKEN` in CI.
2. Run `npx eas-cli build:configure` after EAS login.
3. Add Firebase native config files.
4. Build development APK.
5. Install APK on a real Android device.
6. Execute the UAT plan in `docs/MOBILE_UAT_PLAN.md`.

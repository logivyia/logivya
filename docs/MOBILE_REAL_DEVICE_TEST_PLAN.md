# Logivya Mobile Real Device Test Plan

Audit date: 2026-06-16  
Scope: first Android physical device installation and validation  
App: Logivya Mobile  
Android package: `com.logivya.mobile`  
iOS bundle identifier: `com.logivya.mobile`  
Production API: `https://www.logivya.com`

## Current Validation Summary

| Check | Result |
| --- | --- |
| Mobile TypeScript | Passed with `npm.cmd run typecheck` |
| Expo Doctor | Passed 18/18 with `npx.cmd expo-doctor` |
| Production API config | Passed: `https://www.logivya.com` |
| Android package | Passed: `com.logivya.mobile` |
| iOS bundle ID | Passed: `com.logivya.mobile` |
| App version | Passed: `1.0.0` |
| Android version code | Passed: `1` |
| iOS build number | Passed: `1` |
| App icon path | Present: `apps/mobile/assets/icons/icon.png` |
| Adaptive icon path | Present: `apps/mobile/assets/icons/adaptive-icon.png` |
| Notification icon path | Present: `apps/mobile/assets/icons/notification-icon.png` |
| Splash image path | Present: `apps/mobile/assets/splash/splash-icon.png` |
| Android Firebase file | Missing: `apps/mobile/google-services.json` |
| iOS Firebase file | Missing: `apps/mobile/GoogleService-Info.plist` |
| EAS project ID | Missing/empty |

## Firebase Integration Audit

### Present

- `expo-notifications` is installed.
- `@react-native-firebase/app` is installed.
- `@react-native-firebase/analytics` is installed.
- Android config references `./google-services.json`.
- iOS config references `./GoogleService-Info.plist`.
- Mobile notification service requests permission, creates Android notification channel, gets Expo push token, and registers it with backend.
- Backend push registration endpoint exists at `/api/mobile/push/register`.
- Backend notification center and push delivery service exist.

### Missing

- `apps/mobile/google-services.json`
- `apps/mobile/GoogleService-Info.plist`
- Non-empty `EXPO_PUBLIC_EAS_PROJECT_ID`
- Real Firebase project file validation
- Real device push token registration test
- Real foreground/background push delivery test

### Firebase Readiness

Firebase readiness: **55%**

Push notification readiness: **65%**

Reason:

- App/backend notification architecture exists.
- Native Firebase project files are missing.
- Device delivery has not been proven.

## EAS Build Audit

### Present

- `apps/mobile/eas.json` exists.
- Build profiles exist:
  - `development`
  - `preview`
  - `production`
- Production Android profile builds an app bundle.
- Preview Android profile builds an APK.
- Production API URL is configured through EAS profile env.
- Android package name is correct.
- iOS bundle identifier is correct.
- Versioning is configured.

### Missing

- EAS project ID is empty.
- Expo owner is not resolved in public config unless env is provided.
- Firebase native files are missing.
- No verified EAS Android artifact exists in this audit.
- No verified local Android install exists in this audit.

### Can production build be created today?

**Not reliably yet.**

The Android production AAB command is configured, but it is blocked until:

1. `EXPO_PUBLIC_EAS_PROJECT_ID` is configured.
2. `apps/mobile/google-services.json` is added or securely injected.
3. EAS project/account access is confirmed.

## Android Release Preparation

### Verified Configuration

- App name: `Logivya`
- Android package: `com.logivya.mobile`
- Version name: `1.0.0`
- Version code: `1`
- Production API URL: `https://www.logivya.com`
- Permissions:
  - `INTERNET`
  - `POST_NOTIFICATIONS`
- Camera permission is not requested, which is correct because the current audit did not confirm an in-app QR scanner dependency.
- App scheme: `logivya`
- Splash background: `#0f172a`
- Notification color: `#f97316`

### Exact next Android build command

After EAS project ID and Firebase file are resolved:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
eas build --platform android --profile preview
```

Use `preview` first because it generates an installable APK for a real Android phone.

After the preview APK passes physical device testing:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
eas build --platform android --profile production
```

Use `production` for the Google Play AAB.

## P0 Blockers For Real Android Installation

### P0-1: Missing EAS Project ID

Impact:

- EAS/Expo push token and build identity are incomplete.
- Build may not be linked to the correct Expo project.

Required:

- Set `EXPO_PUBLIC_EAS_PROJECT_ID`.
- Verify `npx expo config --type public` shows a non-empty `extra.eas.projectId`.

### P0-2: Missing Android Firebase File

Impact:

- Android build may fail because `app.json` references `./google-services.json`.
- Firebase Analytics and push-related native config are incomplete.

Required:

- Add `apps/mobile/google-services.json` from the real Logivya Firebase project or configure secure EAS file injection.

### P0-3: Dirty Git State

Impact:

- EAS/Vercel/GitHub may build different code than the local workspace.

Required:

- Commit and push safe source/config/docs changes before release build.
- Exclude secrets and generated folders.

## P1 Blockers For Real Device Validation

### P1-1: Production Environment Confirmation

Required:

- Confirm production API is reachable from a mobile device.
- Confirm CORS/auth/mobile endpoints work outside localhost.
- Confirm `RESEND_API_KEY`, `EMAIL_FROM`, `MOBILE_JWT_SECRET`, database and queue envs exist in production.

### P1-2: Push Token Registration Test

Required:

- Install preview APK.
- Login.
- Grant notification permission.
- Confirm `/api/mobile/push/register` creates or updates `MobilePushToken`.

### P1-3: WhatsApp Provider Test

Required:

- Test QR connect.
- Test phone-code connect.
- Confirm status becomes connected.
- Confirm groups sync.

## P2 Blockers / Follow-Up

### P2-1: iOS Firebase File

Required before TestFlight:

- Add or securely inject `apps/mobile/GoogleService-Info.plist`.

### P2-2: Push Receipt Cleanup

Recommended:

- Process Expo push receipts.
- Revoke invalid tokens automatically.

### P2-3: Store Asset Finalization

Recommended:

- Final screenshots.
- Feature graphic.
- Store descriptions.
- Legal URL confirmation.

## Physical Android Device Test Checklist

Use a real Android phone, not emulator only.

Record for every test:

- Device model
- Android version
- App version
- Build profile
- Network type
- Tester
- Date/time
- Screenshot/video if failed

### 1. Install And Launch

- [ ] Install preview APK.
- [ ] App icon appears as Logivya.
- [ ] App launches without crash.
- [ ] Splash screen appears.
- [ ] App reaches login/auth state.

Expected:

- No blank screen.
- No crash.
- No unreadable text.

### 2. Login

- [ ] Enter existing email/phone.
- [ ] Enter password.
- [ ] Login succeeds.
- [ ] Access token is stored securely.
- [ ] Dashboard opens.

Expected:

- User lands on dashboard.
- No repeated login loop.

### 3. Register

- [ ] Open register screen.
- [ ] Fill required fields.
- [ ] Submit registration.
- [ ] Confirm trial/subscription bootstrap.

Expected:

- Account creates successfully or returns clear validation error.

### 4. Forgot Password

- [ ] Open forgot password.
- [ ] Enter registered email.
- [ ] Receive code by email.
- [ ] Verify code.
- [ ] Set new password.
- [ ] Login with new password.

Expected:

- Email is actually delivered.
- Old sessions are revoked.

### 5. Dashboard

- [ ] Dashboard loads.
- [ ] Subscription state appears.
- [ ] Trial/active/expired status is readable.
- [ ] Notification count loads.

Expected:

- Data matches web account.

### 6. WhatsApp Accounts

- [ ] Open WhatsApp module.
- [ ] Account list loads.
- [ ] Account statuses are localized.
- [ ] Pull to refresh works.

Expected:

- No raw backend status labels.

### 7. QR Connection

- [ ] Open QR connection.
- [ ] Generate QR.
- [ ] Scan from WhatsApp linked devices.
- [ ] Polling stops after connection.
- [ ] Account becomes connected.
- [ ] Groups sync.

Expected:

- QR does not stay stale.
- Success state is shown.

### 8. Phone Connection

- [ ] Enter `0552...`.
- [ ] Confirm normalization to Turkey international format.
- [ ] Generate pairing code.
- [ ] Enter code in WhatsApp.
- [ ] Confirm connected state.
- [ ] Groups sync.

Expected:

- No stale auth state.
- Failed attempt can retry.

### 9. Groups

- [ ] Open groups.
- [ ] Search groups.
- [ ] Filter by account.
- [ ] Filter by category if available.
- [ ] Pull to refresh.

Expected:

- Group names and member counts display correctly.

### 10. Categories

- [ ] Open categories.
- [ ] Create category.
- [ ] Edit category.
- [ ] Assign groups.
- [ ] Remove groups.
- [ ] Delete category with confirmation.

Expected:

- Destructive actions require confirmation.

### 11. Send Message

- [ ] Select group/category.
- [ ] Type message.
- [ ] Send now.
- [ ] Confirm campaign/history status.

Expected:

- If WhatsApp is connected, message should send or return a clear backend reason.

### 12. Scheduled Message

- [ ] Schedule message 5 minutes ahead.
- [ ] Confirm queued state.
- [ ] Wait for due time.
- [ ] Confirm sent/failed status.

Expected:

- Worker sends at due time.

### 13. Support

- [ ] Create support ticket.
- [ ] Open ticket detail.
- [ ] Reply to ticket.
- [ ] Pull to refresh.

Expected:

- Ticket appears in mobile and web/admin.

### 14. Notifications

- [ ] Grant notification permission.
- [ ] Confirm push token registered.
- [ ] Trigger notification event.
- [ ] Receive foreground notification.
- [ ] Receive background notification.
- [ ] Tap notification.

Expected:

- Deep link opens correct app area where supported.

### 15. Logout

- [ ] Logout.
- [ ] Secure storage clears.
- [ ] Push device is revoked or removed.
- [ ] App returns to login.
- [ ] Back navigation does not reopen protected pages.

Expected:

- User stays logged out.

## Readiness Scores

Android build readiness: **70%**  
Firebase readiness: **55%**  
Push notification readiness: **65%**  
Real device readiness: **68%**

## Exact Next Step For Production Android Installation

1. Add or securely inject `apps/mobile/google-services.json`.
2. Set `EXPO_PUBLIC_EAS_PROJECT_ID`.
3. Commit and push the current safe source/config/docs changes.
4. Run:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
eas build --platform android --profile preview
```

5. Install the generated APK on a real Android device.
6. Execute this checklist from top to bottom.


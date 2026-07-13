# Logivya Google Play Release Execution Plan

## Completed in repository

- Expo React Native app exists at `apps/mobile`.
- Android package is `com.logivya.mobile`.
- Production EAS profile outputs Android App Bundle (`.aab`).
- Registration collects Terms, Privacy Policy, and KVKK consent before submit.
- Mobile account deletion path exists: Profile -> Settings -> Hesap -> Hesabi sil.
- Mobile account deletion API exists at `/api/mobile/account/delete`.
- Firebase config references are conditional, so local config resolution does not fail before owner files are provided.
- App assets exist for icon, adaptive icon, notification icon, and splash screen.

## Firebase implementation

Use Firebase project name: `Logivya`.

Required Android app:

- Android package name: `com.logivya.mobile`
- Download file: `google-services.json`
- Place it at: `apps/mobile/google-services.json`

Optional iOS app:

- iOS bundle identifier: `com.logivya.mobile`
- Download file: `GoogleService-Info.plist`
- Place it at: `apps/mobile/GoogleService-Info.plist`

Required Firebase services:

- Firebase Cloud Messaging for Expo push notification delivery support.
- Firebase Analytics if analytics events remain enabled in production.

Optional Firebase services:

- Crashlytics, because the app currently uses Sentry for crash reporting.
- Remote Config, App Distribution, Performance Monitoring, and Dynamic Links are not required for the first Play closed test.

Firebase console steps:

1. Create or open Firebase project `Logivya`.
2. Add Android app with package `com.logivya.mobile`.
3. Download `google-services.json`.
4. Put it in `apps/mobile/google-services.json`.
5. Enable Cloud Messaging.
6. Enable Analytics only if product/legal accepts analytics data collection disclosures.
7. Add iOS app only when preparing TestFlight/iOS release.

## EAS configuration

Missing owner values:

- `EXPO_PUBLIC_EAS_PROJECT_ID`
- `EXPO_PUBLIC_EAS_OWNER`
- EAS Android signing credentials for `com.logivya.mobile`
- Play Console app for package `com.logivya.mobile`

Commands from `apps/mobile`:

```bash
npm run eas:login
npm run eas:whoami
npm run eas:init
```

After `eas init`, copy the generated project id into:

- local env: `EXPO_PUBLIC_EAS_PROJECT_ID`
- EAS project environment variables

## Android build readiness

Verified:

- Package name: `com.logivya.mobile`
- Android permissions: `INTERNET`, `POST_NOTIFICATIONS`
- Custom scheme: `logivya`
- API base URL for production: `https://www.logivya.com`
- Splash/icon/adaptive icon/notification icon paths exist
- No camera permission is requested
- No native file upload permission is requested

Build blockers:

- Missing `apps/mobile/google-services.json`
- Missing `EXPO_PUBLIC_EAS_PROJECT_ID`
- Missing EAS Android signing credentials
- EAS CLI is not installed locally; scripts use `npx eas`

Runtime blockers to test on device:

- Push token registration after EAS project id is set
- WhatsApp QR refresh and polling
- Phone pairing code polling
- Deep links from notifications

## Play Store compliance

Privacy Policy URL:

- `https://www.logivya.com/privacy-policy`

Terms URL:

- `https://www.logivya.com/terms-of-service`

KVKK URL:

- `https://www.logivya.com/kvkk`

Account deletion:

- In-app path: Profile -> Settings -> Hesap -> Hesabi sil
- Backend route: `/api/mobile/account/delete`

Data Safety declarations:

- Personal info: name, email, phone, company details
- App activity: messaging, campaign, support, feedback, WhatsApp workflow activity
- App info and performance: crash diagnostics through Sentry if DSN is configured
- Device or other IDs: device id, Expo push token, mobile session ids
- Financial info: subscription/billing metadata if exposed to mobile account
- Messages: campaign/message content processed by the service

App Access:

- Provide reviewer credentials from `docs/google-play/TEST_ACCOUNT.md`.
- Include a note that WhatsApp QR/phone pairing requires a real WhatsApp account during review.

Content Rating:

- Category: Business/Productivity.
- No gambling, dating, user-generated public feed, or explicit content.
- Messaging features are business-user controlled.

Sensitive permission declarations:

- `POST_NOTIFICATIONS` must be disclosed.
- No camera, location, contacts, microphone, SMS, call log, or storage permission is currently requested.

## Store listing content

App name:

- Logivya

Short description:

- Manage WhatsApp business messaging, groups, campaigns, subscriptions, and support from Logivya.

Full description:

Logivya helps businesses manage WhatsApp-based customer communication from a secure mobile workspace. Connect WhatsApp accounts with QR or phone pairing, review synced groups, organize message categories, follow campaign activity, monitor subscription status, receive operational notifications, and contact support from one app.

Built for teams that need a practical way to manage WhatsApp workflows, Logivya combines account security, mobile session handling, support tickets, campaign visibility, and closed-test feedback tools in a focused business interface.

Key features:

- Secure mobile login and registration
- Legal consent and account deletion controls
- WhatsApp QR and phone pairing workflows
- WhatsApp account status monitoring
- Group and category management
- Messaging and campaign visibility
- Subscription and trial status
- Support ticket access
- Push notifications and deep links
- Closed beta feedback reporting

Keywords:

- WhatsApp business, messaging, campaign management, customer communication, business automation, group management, mobile CRM, support tickets

Category:

- Business

Contact email:

- support@logivya.com

Support URL:

- `https://www.logivya.com/support`

Privacy Policy URL:

- `https://www.logivya.com/privacy-policy`

## Asset audit

Present:

- App icon: `apps/mobile/assets/icons/icon.png`
- Adaptive icon: `apps/mobile/assets/icons/adaptive-icon.png`
- Notification icon: `apps/mobile/assets/icons/notification-icon.png`
- Splash screen: `apps/mobile/assets/splash/splash-icon.png`

Missing for Play Console:

- Feature graphic: 1024 x 500 PNG or JPEG, no alpha.
- Phone screenshots: at least 2, recommended 6-8, 16:9 or 9:16.
- Tablet screenshots: optional unless tablet listing is targeted.

Recommended screenshot set:

1. Login/register with legal consent.
2. Dashboard.
3. WhatsApp accounts.
4. QR connection.
5. Groups/categories.
6. Messaging/history.
7. Subscription.
8. Support/feedback.

## Test plan

Authentication:

- Register with all legal checkboxes unchecked: submit disabled.
- Register with all legal checkboxes checked: account created.
- Login with valid credentials.
- Forgot password request and reset.
- Logout clears session.
- Account deletion requires exact confirmation text and logs user out.

WhatsApp:

- Generate QR code.
- Refresh expired QR code.
- Poll connection status.
- Generate phone pairing code.
- Poll phone pairing status.
- Sync groups after connection.
- Archive/delete WhatsApp account.

Subscription:

- Trial account shows remaining days.
- Active subscription shows limits.
- Expired/suspended subscription blocks restricted actions.

Messaging:

- Create or inspect campaign flow.
- Schedule message where enabled.
- Review history.
- Retry failed items where enabled.

Notifications:

- Ask for notification permission after authentication.
- Register Expo push token.
- Receive test notification.
- Open notification deep link.

## Build execution commands

From repository root:

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

From `apps/mobile`:

```bash
npm run typecheck
npm run eas:login
npm run eas:whoami
npm run eas:init
npm run build:android:production
```

The final Android App Bundle command is:

```bash
npx eas build --platform android --profile production
```

Upload path options:

- Manual: download the `.aab` from EAS and upload it to Play Console closed testing.
- CLI: configure Google service account access, then run `npm run submit:android:production`.

## Closed testing roadmap

Internal testing:

- 2-5 internal testers.
- 1-2 days.
- Goal: smoke test login, registration, QR, pairing, push, support, account deletion.

Closed testing:

- Use at least 12 testers for operational confidence; use 20 if the Play account requires broader closed testing.
- Run for 7-14 days depending Play account requirements and defect rate.
- Collect feedback through the in-app feedback screen and a shared tester form.

Bug triage:

- P0: login/register/build crash/data loss/security issue.
- P1: WhatsApp connection, push, account deletion, subscription blocking issue.
- P2: UI defects, translation issues, non-critical support/messaging bugs.

Production readiness criteria:

- No P0 open.
- No unresolved Play policy issue.
- Push notifications tested on physical Android.
- WhatsApp QR and phone pairing tested on physical Android.
- Data Safety, Content Rating, App Access, privacy links, and screenshots approved.
- AAB promoted from closed testing after successful tester feedback.

## Estimates

- First AAB after owner credentials: 2-4 hours.
- Closed testing setup after first AAB: 4-8 hours.
- Production release after closed testing: 24-48 engineering hours plus Play review time.

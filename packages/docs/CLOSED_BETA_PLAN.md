# Logivya Closed Beta Plan

Date: 2026-06-15
Target: First Android closed beta

## Beta Objective

Validate the first real Logivya Android build on physical devices before public release. The beta focuses on authentication, subscription visibility, WhatsApp account flows, groups, categories, messaging, support, notifications, profile, settings and logout.

## Entry Criteria

- Expo Doctor passes.
- TypeScript passes.
- ESLint passes.
- EAS project is configured.
- Firebase native config files are added.
- Development or preview APK is generated.
- APK installs on at least one physical Android device.
- Test accounts are prepared.

## Tester Checklist

- Install the APK.
- Open the app and verify splash screen.
- Log in with an existing account.
- Register a new test account.
- Use forgot password flow.
- Open dashboard.
- Check subscription/trial status.
- Open WhatsApp accounts.
- Open QR connect screen.
- Open phone code connect screen.
- Open groups.
- Search and filter groups.
- Open categories.
- Create, edit and delete a test category.
- Send a test message where backend account is connected.
- Open message history.
- Open support center.
- Create a support ticket.
- Reply to a ticket.
- Grant notification permission.
- Switch language.
- Switch theme.
- Log out.

## Beta Release Notes

Initial Android beta includes:

- Secure mobile authentication foundation.
- Refresh token support.
- Dashboard and subscription visibility.
- WhatsApp account management screens.
- QR and phone-code connection screens.
- Groups and categories modules.
- Messaging and history modules.
- Support center.
- Notification center.
- Profile, company settings and app settings.
- Dark/light theme support.
- Turkish/English localization foundation.

## Known Issues

- APK/AAB artifacts are not generated until EAS authentication is completed.
- Firebase files are required before full push notification validation.
- Physical device installation requires Android Platform Tools and ADB.
- Store release metadata is not final.

## Feedback Format

Every beta issue must use `docs/MOBILE_BETA_BUG_TEMPLATE.md`.

Required evidence:

- Device model and Android version.
- App version/build number.
- Screen name.
- Steps to reproduce.
- Expected and actual result.
- Screenshot or video when possible.
- Severity.

## Exit Criteria

- No critical login/logout bugs.
- No token refresh blocker.
- No crash on app launch.
- No unreadable text in light or dark mode.
- WhatsApp screens open reliably.
- Support ticket creation works.
- Push permission flow is testable.
- At least five real-device smoke test runs completed.
- All Critical and High beta bugs triaged.

## Closed Beta Readiness

Current status: conditionally ready for beta after APK generation.

Remaining pre-beta blockers:

1. Expo/EAS login or CI token.
2. EAS project linking.
3. Firebase native config files.
4. Android Platform Tools/ADB for local device install.
5. First preview APK build.

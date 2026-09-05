# Google Play Closed Testing Instructions

## Goal

Publish Logivya `1.0.0` to a Google Play closed testing track before production rollout.

## Steps

1. Build the production Android App Bundle:

```bash
cd apps/mobile
eas build --platform android --profile production
```

2. Download the generated `.aab` artifact from EAS.
3. Open Google Play Console.
4. Select the Logivya app.
5. Go to **Testing > Closed testing**.
6. Create a closed testing track, for example `logivya-closed-beta`.
7. Create or select a tester group.
8. Add tester emails.
9. Upload the `.aab`.
10. Add release notes from `docs/google-play/RELEASE_NOTES_1_0_0.md`.
11. Complete App Access instructions using `docs/google-play/TEST_ACCOUNT.md`.
12. Complete Data Safety and Content Rating.
13. Submit the closed test release for review.

## Tester Feedback Process

Ask every tester to report:

- Device model
- Android version
- App version
- Screen name
- Steps to reproduce
- Expected result
- Actual result
- Screenshot or screen recording
- Severity

Use `docs/MOBILE_BETA_BUG_TEMPLATE.md` for structured bug reports.

## Closed Test Focus Areas

- Login and logout
- Password reset
- Dashboard
- WhatsApp account status
- Groups and categories
- Messaging and history
- Support center
- Notifications
- Subscription status
- Offline/reconnect behavior

## Release Gate

Do not promote to production until:

- At least one full smoke test passes on a physical Android device.
- Push notification registration works with Firebase production configuration.
- No critical authentication, tenant isolation, or messaging bug remains open.
- Legal URLs and Data Safety answers are final.

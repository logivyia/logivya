# Final App Store Checklist

## iOS Build

- [x] Bundle identifier is `com.logivya.mobile`.
- [x] App name is `Logivya`.
- [x] App Store version is `1.0`.
- [x] Build 163 is selected for the current App Review submission.
- [x] Build 164 is valid and available in TestFlight; it is not selected for App Review.
- [x] Deep link scheme is `logivya://`.
- [x] Production API base URL is `https://www.logivya.com`.
- [x] EAS production iOS profile is configured.
- [x] App icon and splash references exist.
- [x] Firebase iOS configuration securely injected and validated in the processed IPA.
- [x] EAS project id configured.
- [x] iOS production build created.
- [x] TestFlight upload completed.

## App Store Metadata

- [x] App name prepared.
- [x] Subtitle prepared.
- [x] Promotional text prepared.
- [x] Description prepared.
- [x] Keywords prepared.
- [x] Release notes prepared.
- [x] Support URL set to `https://www.logivya.com/customer-support`.
- [x] Marketing URL verified.
- [x] Privacy policy URL verified at `https://www.logivya.com/privacy-policy`.
- [x] Privacy Choices URL set to `https://www.logivya.com/account-deletion`.
- [x] English (U.S.) metadata contains real English copy while it remains the primary locale.
- [ ] Set Turkish as primary after the current review unlocks screenshot edits; do not withdraw build 163 for this change.

## Privacy and Review

- [x] App Privacy details drafted.
- [x] Privacy Manifest check documented.
- [x] App Review risk analysis prepared.
- [ ] Final App Privacy questionnaire checked against `APP_PRIVACY_DETAILS.md` in App Store Connect.
- [ ] Legal owner approved privacy, terms, KVKK and App Privacy details.
- [x] App Review notes added.
- [x] Test account added and production login verified.
- [ ] Connect a dedicated WhatsApp test line and safe recipient to `appstore-review@logivya.com`.
- [ ] Account Holder verifies Business > Agreements > Compliance > Digital Services Act trader status.

## Screenshots and Assets

- [x] iPhone screenshots uploaded for the current primary locale.
- [x] iPhone 6.5 inch screenshots uploaded.
- [ ] iPhone 5.5 inch screenshots uploaded if required.
- [x] iPad screenshots uploaded for the current primary locale.
- [x] App icon validated in App Store Connect.

## Current review rule

Version 1.0 build 163 is `WAITING_FOR_REVIEW`. Do not remove it from review merely to change the primary language or replace it with build 164. Those are not current binary blockers.

## Build Command

Run from `apps/mobile`:

```bash
eas build --platform ios --profile production
```

## Submit Command

After a successful build and App Store Connect setup:

```bash
eas submit --platform ios --profile production
```

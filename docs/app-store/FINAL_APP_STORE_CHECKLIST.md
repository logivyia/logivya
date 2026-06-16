# Final App Store Checklist

## iOS Build

- [x] Bundle identifier is `com.logivya.mobile`.
- [x] App name is `Logivya`.
- [x] Version is `1.0.0`.
- [x] Build number is configured as `1`.
- [x] Deep link scheme is `logivya://`.
- [x] Production API base URL is `https://www.logivya.com`.
- [x] EAS production iOS profile is configured.
- [x] App icon and splash references exist.
- [ ] `apps/mobile/GoogleService-Info.plist` added.
- [ ] EAS project id configured.
- [ ] iOS production build created.
- [ ] TestFlight upload completed.

## App Store Metadata

- [x] App name prepared.
- [x] Subtitle prepared.
- [x] Promotional text prepared.
- [x] Description prepared.
- [x] Keywords prepared.
- [x] Release notes prepared.
- [ ] Support URL verified.
- [ ] Marketing URL verified.
- [ ] Privacy policy URL verified and legally approved.

## Privacy and Review

- [x] App Privacy details drafted.
- [x] Privacy Manifest check documented.
- [x] App Review risk analysis prepared.
- [ ] Final App Privacy questionnaire completed in App Store Connect.
- [ ] Legal owner approved privacy, terms, KVKK and App Privacy details.
- [ ] App Review notes added.
- [ ] Test account added.

## Screenshots and Assets

- [ ] iPhone 6.7 inch screenshots uploaded.
- [ ] iPhone 6.5 inch screenshots uploaded if required.
- [ ] iPhone 5.5 inch screenshots uploaded if required.
- [ ] iPad screenshots uploaded or tablet support decision finalized.
- [ ] App icon validated in App Store Connect.

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

# Google Play Final Submission Checklist

## Build Configuration

- [x] Android package name is `com.logivya.mobile`.
- [x] App name is `Logivya`.
- [x] Version name is `1.0.0`.
- [x] Version code is configured as `1`.
- [x] Production API base URL is `https://www.logivya.com`.
- [x] Production EAS profile outputs Android App Bundle (`.aab`).
- [x] CAMERA permission is not requested because the mobile app does not currently scan QR codes using the camera.
- [x] Android notification permission is declared.
- [x] App icon, adaptive icon, notification icon, and splash references exist in Expo config.

## Build Command

Run from `apps/mobile`:

```bash
eas build --platform android --profile production
```

Expected artifact:

- Android App Bundle (`.aab`) for Google Play upload.

## Required Native Files Before Production Build

- [ ] `apps/mobile/google-services.json` added from Firebase Android app.
- [ ] `apps/mobile/GoogleService-Info.plist` added from Firebase iOS app before iOS/TestFlight builds.
- [ ] `EXPO_PUBLIC_EAS_PROJECT_ID` or `extra.eas.projectId` configured after EAS project linking.

## Store Listing

- [x] App title prepared.
- [x] Short description prepared.
- [x] Full description prepared.
- [ ] App icon uploaded to Play Console.
- [ ] Feature graphic uploaded.
- [ ] Phone screenshots uploaded.
- [ ] Optional tablet screenshots uploaded.
- [x] Release notes prepared.

## Policy and Compliance

- [ ] Privacy policy URL added.
- [ ] Terms of Service URL verified.
- [ ] KVKK URL verified.
- [x] Data Safety guide prepared.
- [ ] Data Safety form completed in Play Console.
- [ ] Content rating completed.
- [ ] App access instructions completed.
- [ ] Legal owner reviewed privacy, terms, KVKK and data safety answers.

## Closed Testing

- [x] Closed testing instructions prepared.
- [ ] AAB uploaded.
- [ ] Closed test track created.
- [ ] Tester group created.
- [ ] Testers added.
- [ ] Release submitted for closed testing.
- [ ] Feedback collection process prepared.

## Final Gate

- [ ] Production AAB build succeeds.
- [ ] Smoke test passes on physical Android device.
- [ ] No real customer data appears in screenshots.
- [ ] Reviewer test account works.
- [ ] Push notifications tested with Firebase configuration.

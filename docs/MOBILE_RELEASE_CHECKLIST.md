# Logivya Mobile Release Checklist

Last updated: 2026-06-15

## Release Scope

This checklist covers the production release gate for the Logivya Expo React Native mobile app in `apps/mobile`.

The current release candidate includes:

- Token-based mobile authentication
- Refresh token session recovery
- Dashboard placeholders and mobile business screens
- WhatsApp account connection flows
- Groups and categories
- Messaging and history entry points
- Support center
- Profile, settings, subscription status
- Push notification registration foundation
- Deep linking
- Offline cache foundation
- Analytics and crash reporting foundation

## Android Checklist

- [ ] Confirm `apps/mobile/google-services.json` exists for Firebase Android.
- [ ] Confirm Android package is `com.logivya.mobile`.
- [ ] Confirm adaptive icon foreground and background render correctly.
- [ ] Confirm notification permission prompt works on Android 13+.
- [ ] Confirm Expo push token registration succeeds on a physical Android device.
- [ ] Confirm deep links open:
  - `logivya://dashboard`
  - `logivya://whatsapp/accounts`
  - `logivya://support`
  - `logivya://reset-password`
- [ ] Run `npx expo-doctor` from `apps/mobile`.
- [ ] Run `eas build --platform android --profile preview`.
- [ ] Test APK on a physical Android device.
- [ ] Run production build with `eas build --platform android --profile production`.
- [ ] Verify Play Store signing and version code auto-increment.

## iOS Checklist

- [ ] Confirm `apps/mobile/GoogleService-Info.plist` exists for Firebase iOS.
- [ ] Confirm bundle identifier is `com.logivya.mobile`.
- [ ] Confirm APNs is configured for Firebase Cloud Messaging.
- [ ] Confirm push notification entitlement is enabled.
- [ ] Confirm remote notification background mode is present.
- [ ] Confirm Expo push token registration succeeds on a physical iPhone.
- [ ] Confirm deep links and universal links open correctly.
- [ ] Run `eas build --platform ios --profile preview`.
- [ ] Test on TestFlight.
- [ ] Run production build with `eas build --platform ios --profile production`.
- [ ] Verify App Store Connect metadata and screenshots.

## Play Store Checklist

- [ ] App name: Logivya.
- [ ] Short description prepared.
- [ ] Full description prepared.
- [ ] Privacy Policy URL published.
- [ ] Data Safety form completed.
- [ ] Account deletion instructions published.
- [ ] Support email configured.
- [ ] Screenshots prepared for phone and tablet.
- [ ] App icon uploaded.
- [ ] Content rating completed.
- [ ] Closed testing track created before production rollout.

## App Store Checklist

- [ ] App name: Logivya.
- [ ] Subtitle prepared.
- [ ] Privacy Policy URL published.
- [ ] App Privacy questionnaire completed.
- [ ] Support URL configured.
- [ ] Marketing URL configured if available.
- [ ] Screenshots prepared for required iPhone sizes.
- [ ] App icon uploaded.
- [ ] Export compliance answered.
- [ ] TestFlight build tested before review submission.

## Security Checklist

- [x] Access and refresh tokens are stored in `expo-secure-store`.
- [x] AsyncStorage is used only for non-secret query cache persistence.
- [x] Logout clears secure tokens, Zustand domain stores and React Query cache.
- [x] Expired refresh tokens force local session cleanup.
- [x] Access tokens are refreshed before expiry where possible.
- [x] 401 responses trigger refresh and fallback logout.
- [x] Mobile API calls use bearer tokens, not web cookies.
- [x] API errors are reported without exposing secrets.
- [ ] Add backend endpoint for "logout all devices".
- [ ] Confirm mobile password reset invalidates existing sessions where required.
- [ ] Confirm production Sentry DSN is set through EAS secrets.
- [ ] Confirm Firebase config files do not contain private server keys.

## QA Checklist

- [ ] Fresh install opens splash and lands on Login.
- [ ] Login works with existing user.
- [ ] Register creates a new account and session.
- [ ] Forgot password sends code and resets password.
- [ ] Token refresh works after access token expiry.
- [ ] Logout revokes session and clears cached data.
- [ ] Airplane mode shows network-safe errors.
- [ ] Reconnect after offline state refreshes cached data.
- [ ] WhatsApp account list loads.
- [ ] QR connect flow generates QR and polls status.
- [ ] Phone code connect normalizes Turkish numbers and polls status.
- [ ] Groups list loads and searches.
- [ ] Categories create/edit/delete flow works.
- [ ] Category assignment flow works.
- [ ] Messaging send and schedule flows call confirmed endpoints.
- [ ] Message history loads.
- [ ] Support ticket create/detail/reply works.
- [ ] Subscription status shows current plan and remaining days.
- [ ] Notifications permission, foreground and open handling work.
- [ ] Light mode has no invisible text.
- [ ] Dark mode has no invisible text.
- [ ] Turkish and English labels do not mix on core screens.

## Release Checklist

- [ ] `npm install` completed at repo root.
- [ ] `npm run lint` passes at repo root.
- [ ] `npm run build` passes at repo root.
- [ ] `npm run typecheck` passes in `apps/mobile`.
- [ ] `npx expo config --type public` passes in `apps/mobile`.
- [ ] `npx expo-doctor` passes or has documented non-blocking warnings.
- [ ] EAS project id is configured.
- [ ] Firebase Android/iOS files are present in `apps/mobile`.
- [ ] Sentry DSN is configured through EAS/Expo environment.
- [ ] Firebase Analytics is verified on a device build.
- [ ] Push notification token registration verified against production API.
- [ ] Store metadata and screenshots are ready.
- [ ] Release notes prepared.
- [ ] Rollback plan prepared.


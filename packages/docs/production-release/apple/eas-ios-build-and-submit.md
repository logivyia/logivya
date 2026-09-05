# EAS iOS Build and Submit

## Current build configuration

- Workflow: Expo managed with EAS prebuild
- Expo SDK: `54`
- EAS account: `@logivya`
- EAS project ID: configured in app config
- Profile: `ios-production`
- Distribution: App Store
- Simulator: disabled
- Development client: disabled
- Version: `1.0.7` for the isolated `ios-production` profile
- iOS build number: `178`
- Bundle ID: `com.logivya.mobile`
- Apple Team ID: `YMW24BAWTV`

The current candidate is `1.0.7 (178)`. It carries the verified Android v204 unified-master implementation: consolidated WhatsApp management, Telegram management, simplified navigation and settings, marketplace and saved-demand flows, advertiser contact actions, and attachment reliability improvements without changing the Google Play tracks. Facebook Pages remains internal while provider review is pending. The preflight queries App Store Connect and blocks duplicate or lower build numbers. This project keeps EAS `appVersionSource` local because changing it globally would also change Android version governance; every later iOS candidate must update `IOS_BUILD_NUMBER` deterministically before approval.

## Preflight

From the repository root:

```powershell
npm run apple:validate-env
npm run apple:audit
npm run apple:validate-eas
npm run ios:testflight:status
npm run ios:preflight
npm run mobile:typecheck
npm run lint
npm run release:secret-scan
```

The first iOS build is blocked until:

1. The Firebase iOS `GoogleService-Info.plist` for `com.logivya.mobile` is placed at `apps/mobile/GoogleService-Info.plist` locally and remains ignored by Git.
2. `npm run ios:preflight` returns `goForFirstTestFlightBuild: true`.
3. Apple agreements and account conditions are clear.

## Build

After a GO decision:

```powershell
npm --prefix apps/mobile run build:ios:production
```

Use EAS-managed Apple Distribution credentials unless a deliberate existing credential strategy is proven. If EAS requests interactive Apple authentication or approval to create a certificate/profile, stop and have the Apple Account Holder or Admin review the exact action.

## Submit to TestFlight

Submission is fail-closed. Use an explicitly approved build ID or IPA path and set approval only for the current shell:

```powershell
$env:APPLE_SUBMISSION_APPROVED='YES'
npm run apple:submit-approved -- --id <APPROVED_EAS_BUILD_ID> --app-id 6792539737 --bundle-id com.logivya.mobile
Remove-Item Env:APPLE_SUBMISSION_APPROVED
```

Do not use `--latest`; it can select the wrong artifact. Upload to TestFlight is not the same as submitting the app for App Review.

The build command is also fail-closed:

```powershell
$env:APPLE_BUILD_APPROVED='YES'
npm run ios:build -- --app-id 6792539737 --bundle-id com.logivya.mobile
Remove-Item Env:APPLE_BUILD_APPROVED
```

## Signing and notification checks

After the first EAS build, verify:

- Apple Distribution certificate team is `YMW24BAWTV`.
- Provisioning profile bundle ID is `com.logivya.mobile`.
- APNs entitlement is present when push notifications are enabled.
- `aps-environment` is correct for App Store distribution.
- Generated `PrivacyInfo.xcprivacy` files cover required-reason APIs.
- The app launches on a physical iPhone and receives a test notification.

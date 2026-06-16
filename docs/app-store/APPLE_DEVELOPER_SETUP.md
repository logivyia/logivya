# Apple Developer Setup

## Requirements

- Active Apple Developer Program membership.
- Access to App Store Connect.
- Access to the Logivya Apple team with permission to manage apps, certificates, identifiers, profiles, and TestFlight.
- EAS CLI authenticated with an Expo account that can access the Logivya project.

## Bundle ID

- Bundle identifier: `com.logivya.mobile`
- App name: `Logivya`
- Version: `1.0.0`
- Build number: `1`

## App Store Connect Setup

1. Open App Store Connect.
2. Create a new app.
3. Select platform: iOS.
4. App name: `Logivya`.
5. Primary language: Turkish or English, depending on launch market.
6. Bundle ID: `com.logivya.mobile`.
7. SKU: `logivya-mobile-ios`.
8. User access: restrict to the Logivya release team.

## Certificates and Provisioning Profiles

EAS can manage credentials automatically after Apple login:

```bash
cd apps/mobile
eas build --platform ios --profile production
```

During the first build, EAS may ask to:

- Sign in with Apple ID.
- Select the Apple team.
- Create or reuse distribution certificate.
- Create or reuse provisioning profile.
- Register bundle identifier if missing.

## TestFlight Setup

### Internal Testers

- Add company team members in App Store Connect.
- Assign appropriate roles.
- Upload the first iOS build.
- Enable testing for the uploaded build.

### External Testers

- Create an external tester group.
- Add tester emails.
- Fill beta app review information.
- Submit the build for Beta App Review.
- Share TestFlight invite link after approval.

## App Review Preparation

Prepare before review:

- Privacy policy URL.
- Support URL.
- App Review notes.
- Test account credentials.
- Explanation that Logivya is a business communication management platform.
- Disclaimer that Logivya is not affiliated with WhatsApp, Meta, Facebook, Instagram or Telegram.

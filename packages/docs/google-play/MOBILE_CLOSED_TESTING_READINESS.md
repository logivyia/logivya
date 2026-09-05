# Logivya Mobile Closed Testing Readiness

## Current build path

- Mobile app: `apps/mobile`
- Runtime: Expo React Native
- Android package: `com.logivya.mobile`
- Closed testing artifact: Android App Bundle (`.aab`)
- Production EAS profile: `apps/mobile/eas.json` -> `production`

## Values required from the owner

Firebase:

- `apps/mobile/google-services.json` from the Firebase Android app for `com.logivya.mobile`
- Optional iOS parity file: `apps/mobile/GoogleService-Info.plist`
- Firebase Analytics enabled for the project if analytics is required in the Play build

EAS:

- `EXPO_PUBLIC_EAS_PROJECT_ID`
- `EXPO_PUBLIC_EAS_OWNER`
- EAS Android credentials configured for `com.logivya.mobile`
- Play Console app created for `com.logivya.mobile`

Store compliance:

- Privacy Policy URL: `https://www.logivya.com/privacy-policy`
- Terms URL: `https://www.logivya.com/terms-of-service`
- KVKK URL: `https://www.logivya.com/kvkk`
- Account deletion path in app: Profile -> Settings -> Hesap -> Hesabi sil
- Reviewer test account for Play Console App access
- Data Safety form completed for account, device, analytics, support, subscription, and WhatsApp workflow data

## Commands

Run from repository root:

```bash
npm run typecheck
npm run lint
npm run build
```

Run from `apps/mobile` after owner values and credentials are available:

```bash
npx eas build --platform android --profile production
```

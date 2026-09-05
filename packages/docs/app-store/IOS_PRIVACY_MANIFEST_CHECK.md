# iOS Privacy Manifest Check

## Current Mobile Dependencies Reviewed

- `expo-secure-store`
- `expo-notifications`
- `expo-linking`
- `@react-native-firebase/app`
- `@react-native-firebase/analytics`
- `@sentry/react-native`
- `@react-native-async-storage/async-storage`
- React Navigation
- Networking/API client

## Privacy-Sensitive Areas

### Secure Storage

Used for mobile tokens/session data. This is expected and appropriate. Do not store access or refresh tokens in AsyncStorage.

### Notifications

Used for push notification token registration and notification handling. iOS notification permission wording and App Privacy details must disclose notification usage.

### Camera

No camera package or camera permission is currently configured. The app displays QR codes for scanning by WhatsApp; it does not scan QR codes with the device camera.

### Networking

The app communicates with the Logivya production API over HTTPS. App Transport Security should remain strict unless a specific approved exception is required.

### Analytics

Firebase Analytics dependency exists. App Privacy must disclose analytics events if enabled in production.

### Crash Reporting

Sentry dependency exists. App Privacy must disclose diagnostics collection if enabled in production.

## Privacy Manifest Requirement

Apple requires privacy manifests for apps and SDKs that use required-reason APIs or third-party SDKs subject to Apple's privacy manifest requirements.

Action items:

- Confirm installed SDK versions include their own privacy manifests where required.
- Run iOS build validation and inspect generated native project metadata.
- If any required-reason API usage is flagged, add the required reason in the iOS privacy manifest before submission.

## Current Blockers

- The Firebase iOS configuration is securely injected and intentionally excluded from Git. The processed IPA contains the correct `com.logivya.mobile` Firebase configuration.
- The processed App Store IPA contains the app and SDK privacy manifests required by the current dependency set.
- Final Apple Privacy answers still require Account Holder/legal approval in App Store Connect because Apple does not expose the questionnaire through the public API.

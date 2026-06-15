# Logivya Mobile

Official Logivya mobile application foundation built with React Native + Expo and TypeScript.

## What is included

- Auth stack: splash, login, register, forgot password, reset password
- App stack: dashboard, WhatsApp, groups, categories, messaging, support, profile placeholders
- Secure token storage with `expo-secure-store`
- Central API client with bearer token injection, timeout, retry, refresh-token handling, and normalized errors
- Zustand stores: auth, app, settings
- Turkish/English i18n infrastructure
- Light/dark theme infrastructure
- Logivya icon, splash, and image assets

## Run locally

```bash
cd apps/mobile
npm install
npm run start
```

## API base URL

The default API URL is configured in `app.json`:

```json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "https://www.logivya.com"
    }
  }
}
```

Use the production Logivya URL for production builds and a LAN-accessible URL for device testing against local backend.

## Security notes

- Access and refresh tokens are stored only in `expo-secure-store`.
- Tokens are never persisted in AsyncStorage.
- Refresh token rotation is handled by `/api/mobile/auth/refresh`.
- Logout revokes the refresh token through `/api/mobile/auth/logout`.
- Biometric and device-binding architecture hooks are prepared through settings/device storage.

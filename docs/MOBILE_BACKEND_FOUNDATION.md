# Logivya Mobile Backend Foundation

This document describes the backend contract prepared for the official Android and iOS Logivya apps.

## Authentication Flow

Mobile authentication is separate from the existing web cookie session.

1. The app calls `POST /api/mobile/auth/login` or `POST /api/mobile/auth/register`.
2. The API returns:
   - short-lived `accessToken`
   - long-lived `refreshToken`
   - token type `Bearer`
   - refresh expiry timestamp
3. The app sends `Authorization: Bearer <accessToken>` to all mobile protected endpoints.
4. When the access token expires, the app calls `POST /api/mobile/auth/refresh`.
5. Logout calls `POST /api/mobile/auth/logout` and revokes the current refresh token.

Access tokens are signed server-side. Refresh tokens are opaque random tokens and are stored only as SHA-256 hashes in `MobileDeviceSession`.

## Device Session Lifecycle

`MobileDeviceSession` stores:

- userId
- companyId
- deviceId
- platform
- appVersion
- userAgent
- refreshTokenHash
- lastUsedAt
- expiresAt
- revokedAt

Creating a new session for the same user/company/device revokes the older session. Refresh token rotation updates the stored hash on every refresh.

## Token Storage Guidance

Mobile clients must store:

- iOS: Keychain
- Android: Keystore-backed secure storage

Do not store tokens in AsyncStorage, plain files, logs, crash reports, or analytics events.

## Endpoint List

### Auth

- `POST /api/mobile/auth/login`
- `POST /api/mobile/auth/register`
- `POST /api/mobile/auth/forgot-password`
- `POST /api/mobile/auth/verify-reset-code`
- `POST /api/mobile/auth/reset-password`
- `POST /api/mobile/auth/refresh`
- `POST /api/mobile/auth/logout`
- `GET /api/mobile/auth/me`

### App Bootstrap

- `GET /api/mobile/bootstrap`
- `GET /api/mobile/subscription/status`

### WhatsApp

- `GET /api/mobile/whatsapp/accounts`
- `POST /api/mobile/whatsapp/accounts/qr`
- `POST /api/mobile/whatsapp/accounts/phone-code`
- `GET /api/mobile/whatsapp/accounts/:id/status`
- `POST /api/mobile/whatsapp/accounts/:id/reconnect`
- `POST /api/mobile/whatsapp/accounts/:id/archive`
- `DELETE /api/mobile/whatsapp/accounts/:id`

### Groups and Categories

- `GET /api/mobile/groups`
- `GET /api/mobile/categories`
- `POST /api/mobile/categories`
- `PATCH /api/mobile/categories/:id`
- `DELETE /api/mobile/categories/:id`

### Messaging

- `POST /api/mobile/messages/send`
- `POST /api/mobile/messages/schedule`
- `GET /api/mobile/messages/history`
- `GET /api/mobile/messages/history/:id`

### Support

- `GET /api/mobile/support/tickets`
- `POST /api/mobile/support/tickets`
- `GET /api/mobile/support/tickets/:id`
- `POST /api/mobile/support/tickets/:id/messages`

### Notifications

- `POST /api/mobile/notifications/register-token`

## Response Format

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "STRING_CODE",
    "message": "User-safe message",
    "details": null
  }
}
```

## Required Environment Variables

- `DATABASE_URL`
- `MOBILE_JWT_SECRET`
- `PASSWORD_PEPPER`
- `REDIS_URL` for queues/rate limits already used by the platform
- `RESEND_API_KEY` and `EMAIL_FROM` for password reset email delivery
- `MOBILE_MIN_SUPPORTED_VERSION` optional

`MOBILE_JWT_SECRET` must be a long random value. Rotate it carefully because rotation invalidates mobile access tokens.

## Security Notes

- Mobile endpoints use bearer token auth, not browser CSRF.
- Existing web cookie auth remains unchanged.
- Tenant isolation is enforced through `companyId` from the validated mobile session.
- Refresh tokens are revocable and stored hashed.
- Password reset revokes both web sessions and mobile device sessions.
- Sensitive actions write audit logs.
- WhatsApp QR/phone code endpoints have mobile rate limiting and permission checks.

## Postman Test Example

Login:

```bash
curl -X POST https://www.logivya.com/api/mobile/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"user@example.com","password":"Password123!","deviceId":"ios-device-1","platform":"ios","appVersion":"1.0.0"}'
```

Bootstrap:

```bash
curl https://www.logivya.com/api/mobile/bootstrap \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

Refresh:

```bash
curl -X POST https://www.logivya.com/api/mobile/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"REFRESH_TOKEN"}'
```

Logout:

```bash
curl -X POST https://www.logivya.com/api/mobile/auth/logout \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"REFRESH_TOKEN"}'
```

## Migration

Run:

```bash
npm run db:generate
npm run db:push
```

Use `prisma migrate dev` instead of `db:push` when preparing a formal production migration.

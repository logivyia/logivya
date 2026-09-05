# Logivya Mobile Final UAT Checklist

## Authentication

- Login works with valid credentials.
- Invalid credentials show safe error.
- Register opens and validates fields.
- Forgot password sends code when email provider is configured.
- Reset password succeeds with valid code.
- Logout clears session and push token.

## WhatsApp

- Account list loads.
- QR screen opens.
- Phone code screen normalizes Turkish numbers.
- Reconnect, archive and delete ask confirmation.
- Connection status labels are localized.

## Groups

- Groups load.
- Search works.
- Account/category filters work.
- Empty and error states are readable.

## Categories

- Categories load.
- Create/edit/delete flows work.
- Assignment detail opens.
- Destructive actions ask confirmation.

## Messaging

- Message compose screen opens.
- Target group selection works.
- Immediate send and scheduled send validation works.
- Failed backend responses are visible.

## History

- Message history loads.
- Campaign status labels are readable.
- Detail screens are accessible.

## Support

- Ticket list loads.
- Ticket creation works without priority field.
- Ticket detail and conversation work.

## Notifications

- Permission prompt works.
- Push token registers.
- Notification list loads.
- Unread count updates.
- Mark read and mark all read work.

## Subscriptions

- Current plan and status display.
- Trial, active, expired, suspended and cancelled labels are localized.
- Upgrade button is visible but does not start payment flow.

## Profile

- User, email, phone, role and company show.
- Company settings show current company details.
- Feedback screen sends bug/feature report.

## Settings

- Language switch works.
- Theme switch works.
- App version and release channel display.
- Logout works.

## Security

- Token stored only in secure storage.
- Refresh token rotation works.
- Tenant data does not leak between accounts.
- Admin routes are not exposed in mobile app.

## Release Exit Criteria

- No P0 bugs open.
- No unresolved auth/session bugs.
- Push, login, WhatsApp, messaging and support pass on a physical Android device.
- Closed beta documentation is complete.

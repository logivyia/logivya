# Google Play Reviewer Test Account

## Test Account

- Email: `appstore-review@logivya.com`
- Password: stored only in Google Play Console App access; never commit it
- Role: company owner
- Subscription status: active Professional review subscription
- WhatsApp access: one dedicated review account is connected
- MFA: keep reviewer login free of one-time codes or other external dependencies

## Reviewer Can Test

- Login
- Dashboard
- Subscription status
- WhatsApp accounts screen
- Groups screen
- Categories screen
- Messaging screen with safe demo data
- Message history
- Support ticket creation
- Notifications screen
- Profile and settings
- Logout

## Reviewer Should Not Test

- Real WhatsApp account pairing with a personal WhatsApp account unless a dedicated test WhatsApp account is provided.
- Production customer data.
- Payment with a real card.

## Notes For App Access

Provide this account in Google Play Console App access instructions. Test the exact
Console credentials in a fresh signed-out session before applying for production.
Do not commit the real password or include it in screenshots, logs, or support
messages.

The production account state can be checked without printing secrets:

```powershell
npx tsx --env-file=.env.production.local scripts/google-play/audit-review-account.ts
```

Disclaimer: Logivya is not affiliated with WhatsApp, Meta, Facebook, Instagram or Telegram.

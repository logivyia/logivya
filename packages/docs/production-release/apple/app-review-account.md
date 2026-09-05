# App Review Account

Status: `VERIFY ON BUILD 176 BEFORE APP REVIEW`

Create a dedicated, stable reviewer account. Do not use a founder's personal account and do not commit credentials.

The account must:

- Sign in without an invitation, OTP, or unavailable second factor blocking Apple.
- Have a representative personal workspace and approved synthetic test data.
- Have enough subscription entitlement to demonstrate the submitted features.
- Have the limited internal permissions required to inspect the freight marketplace and Telegram modules while their public rollout flags remain disabled.
- Use only a WhatsApp account that the reviewer is authorized to access.
- Avoid real customer names, numbers, messages, groups, billing data, and support content.
- Remain active throughout review.

Enter the username, password, and any special instructions manually in App Store Connect or an approved secret manager. The repository stores only the non-secret review procedure.

## Review steps

1. Sign in with the dedicated reviewer account.
2. Open Share Load, Find Loads, Find Vehicles, Find Drivers, My Listings, and Create Request.
3. Inspect a saved request and its matching-notification flow using synthetic data.
4. Open WhatsApp Accounts and Telegram Accounts and inspect the authorized connection areas.
5. Open Groups, Contacts, Categories, Message Send, and Message History without contacting real recipients.
6. Open Subscription, Restore Purchases, Privacy, and Account Deletion.
7. Explain third-party account verification prerequisites in Review Notes without exposing a code or credential.

The iOS build supports direct account creation with name, email, password, and the required legal consents;
the phone number remains optional. It must not expose a web checkout, an external purchase link, or another
payment method. All digital plans visible on iOS must use Apple In-App Purchase and include Restore Purchases.

App Review submission remains blocked until this account is created and verified from a clean physical device.

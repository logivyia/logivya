# Apple App Privacy Worksheet

Status: `LEGAL AND HUMAN REVIEW REQUIRED`

This worksheet is an engineering inventory. It is not authorization to submit App Privacy answers.

| Apple data category | Evidence in Logivya | Linked to identity | Tracking | Purpose and control |
| --- | --- | --- | --- | --- |
| Contact Info: name, email, phone, physical address, other contact info | Registration, company/invoice profile, invitations | Yes | No evidence of cross-company tracking | Account, security, team access, support; account deletion and data rights flows exist |
| Contacts | Authorized WhatsApp contact and group synchronization | Yes | No | Customer-requested messaging functionality |
| Identifiers: user ID, device ID, push token | Authentication and mobile push registration | Yes | No | Login/session security and notifications; push permission is optional |
| User Content: support messages | Support ticket threads | Yes | No | User-requested support; retention and deletion require legal approval |
| User Content: WhatsApp group, message, schedule and delivery metadata | Connected-account features | Yes | No | User-requested business messaging; tenant/account ownership filters apply |
| Purchases: subscription and billing references | Plan state, manual payment and invoice records | Yes | No | SaaS entitlement and administration; no StoreKit or native IAP SDK was found |
| Usage Data: product interaction | Firebase Analytics integration | Potentially | No tracking evidence | Optional product analytics preference; exact release behavior must be verified |
| Diagnostics: crash, performance, and other diagnostic data | Sentry integration and minimal mobile recovery event | Yes, conservatively | No | Optional Sentry diagnostics plus always-available redacted recovery reporting |
| Other Data: company/team configuration | Company and role management | Yes | No | Workspace operation and authorization |

## SDK and processor evidence

- Expo Notifications: Expo push token, device identifier, notification delivery metadata.
- Firebase Analytics: optional product interaction analytics; the iOS app is registered for `com.logivya.mobile` and its local `GoogleService-Info.plist` is validated and excluded from Git.
- Sentry: optional diagnostics; PII, sampling, region, and production DSN must be confirmed for the exact build.
- Vercel/database/email/object storage providers: account, operational, support, export, and backup processing as described in the privacy documentation.
- WhatsApp infrastructure: only for accounts and messaging activity initiated by the customer.

## Required human decisions

1. Confirm every category against the processed TestFlight binary and production network behavior.
2. Confirm whether analytics and diagnostics are disabled until consent on iOS.
3. Confirm retention, deletion exceptions, processors, and international transfers with counsel.
4. Confirm that no data is used for tracking as Apple defines that term.
5. Confirm subscription disclosure and App Store payment-policy treatment.
6. Enter App Privacy answers manually only after approval; do not automate submission.

Sources: `docs/privacy/store-disclosures.json`, `docs/privacy/data-processing-inventory.md`, `docs/privacy/sdk-privacy-audit.md`, and the mobile source tree.

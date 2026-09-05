# Google Play Console App Content - v136 Evidence Sheet

Status: `CONSOLE RECONCILIATION IN PROGRESS`

This sheet is tied to Android `versionCode 136`, `versionName 1.0.106`, package
`com.logivya.mobile`. It is an evidence source for Play Console answers, not a
claim that the external forms have already been submitted.

## Binary Evidence

- AAB SHA-256: `44FBECDA483363A9CDB21B510B4434161108D2BA40D26859E86B9616B69F2BE9`
- Minimum / target SDK: `24 / 36`
- Advertising ID and AdServices permissions: absent
- Camera, contacts, location, microphone, SMS and call-log permissions: absent
- Broad storage and media permissions: absent
- Notification permission: present
- Production API: `https://www.logivya.com`
- Four Android ABIs are present

## Console Answer Matrix

| Console section | Evidence-based answer | Evidence / note |
| --- | --- | --- |
| Privacy policy | `https://www.logivya.com/privacy-policy` | Public HTTP 200, no login required |
| App access | Some/all functionality requires login | Reconcile the already-entered reviewer account in Console; never commit its password |
| Ads | No, the app does not contain ads | No ads SDK or advertising identifier permission in v136 |
| Target audience | Business users; select only adult age groups | Logivya is a B2B SaaS product and is not designed for children |
| Content rating | Business/productivity messaging; no violence, sexual content, gambling, drugs or public UGC feed | WhatsApp messages are initiated by authenticated business users |
| News app | No | The product does not publish news or magazine content |
| COVID-19 / contact tracing | No | No health-status or proximity/contact-tracing function |
| Government app | No | Logivya is a private business SaaS product |
| Financial features | No financial features | Subscription metadata is SaaS access/billing metadata, not banking, lending, trading, wallets, transfers or financial advice |
| Health apps | My app does not provide any health features | No health functionality, health data, Health Connect or health permissions |
| Account deletion | In-app deletion plus `https://www.logivya.com/account-deletion` | Public HTTP 200; in-app path is Settings -> Account deletion |
| Data safety | Data is collected; reconcile categories below | Must match exact production providers and v136 runtime behavior |

## Verified Console Progress - 2026-07-19

The authenticated Play Console session was inspected directly. The following
sections are saved and were rechecked against the v136 evidence:

- Privacy policy: `https://www.logivya.com/privacy-policy`
- Ads: no ads
- Content rating: submitted
- Government app: no
- Financial features: no financial features
- Health features: none
- Advertising ID: not used
- Data Safety: all selected data types and purposes are answered; draft saved
- Store category: Application / Business
- Store contact email: `support@logivya.com`
- Store website: `https://www.logivya.com`

The following external Console work is still pending:

- Upload the prepared store assets and save the default `en-US` store listing.
- Supply a real, full-access Google Play reviewer account in App access. Its
  password must be entered only in Play Console and never committed.
- Submit Target audience as adult business users after App access is complete.
- Submit the saved Data Safety draft after Target audience is complete.
- Recheck the v136 closed-test release after all setup gates clear.

## Data Safety Inventory

The following data can be collected or processed when the user uses the
corresponding functionality:

- Name, email address, phone number and company/workspace information for
  account management, authentication, security and support.
- User-provided message, support-ticket and category content for requested app
  functionality and customer support.
- WhatsApp account, contact, group and message metadata for the user-requested
  messaging service. Device contacts permission is not requested.
- Subscription status and billing references for entitlement and account
  administration. The mobile app does not provide banking or other financial
  services.
- Device identifier, app version and push token for secure sessions,
  notifications, fraud prevention and reliability.
- Optional analytics and crash diagnostics only after the corresponding
  privacy preference is granted. Both preferences default to disabled.

Data is encrypted in transit. Account/data deletion is supported, subject to
documented legal retention requirements. Infrastructure and processing
providers must be represented according to Google's current Data Safety
definitions; data is not sold.

## Store Listing

- App name: `Logivya`
- Category: `Business`
- Contact email: `support@logivya.com`
- Support URL: `https://www.logivya.com/support`
- Privacy URL: `https://www.logivya.com/privacy-policy`
- Terms URL: `https://www.logivya.com/terms-of-service`
- KVKK URL: `https://www.logivya.com/kvkk`

The default Play listing language is `en-US`, so use the English sections in
`FULL_DESCRIPTION.md` and `SHORT_DESCRIPTION.md`. The prepared assets are in
`docs/google-play/store-assets-v136/`:

| Asset | Size |
| --- | --- |
| `app-icon-512.png` | 512 x 512 |
| `feature-graphic-1024x500.png` | 1024 x 500 |
| `phone-01-login.png` | 540 x 960 |
| `phone-02-register.png` | 525 x 933 |
| `tablet7-01-login.png` | 720 x 1280 |
| `tablet7-02-register.png` | 720 x 1280 |
| `tablet10-01-login.png` | 1080 x 1920 |
| `tablet10-02-register.png` | 1080 x 1920 |

The external Console must show a non-empty short and full description before a
release can be saved.

## Required Console Verification

1. Open App content and compare every previously completed section against this
   matrix.
2. Correct any answer that conflicts with the v136 permission and SDK evidence.
3. Submit the Financial features declaration as no financial features.
4. Submit the Health apps declaration as no health features.
5. Confirm the reviewer login remains valid without exposing its password in
   source control.
6. Confirm the full description, public policy URLs and account-deletion URL
   are saved.
7. Return to the closed-test release review and verify that policy errors are
   cleared before saving or publishing the release.

Google Play Developer Publishing API access cannot submit App content, Health,
Financial features or Data Safety declarations. Those sections must be saved in
the authenticated Play Console interface.

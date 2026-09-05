# Apple IAP Release - iOS Build 165

## Review rejection addressed

- Guideline 5.1.1(v): iOS registration no longer requires a phone number.
- Guideline 3.1.1: iOS uses Apple In-App Purchase for digital subscriptions.
- Normal and invited iOS user registration remains available with email.
- Android and web registration and billing behavior are unchanged.
- The WhatsApp and message delivery core is unchanged.

## Subscription products

| Plan | Product ID | Apple Turkey price | User accounts | WhatsApp connections |
| --- | --- | ---: | ---: | ---: |
| Starter monthly | `com.logivya.mobile.starter.monthly` | TRY 279.99 | 2 | 2 |
| Starter yearly | `com.logivya.mobile.starter.yearly` | TRY 3,000.00 | 2 | 2 |
| Professional monthly | `com.logivya.mobile.professional.monthly` | TRY 379.99 | 3 | 3 |
| Professional yearly | `com.logivya.mobile.professional.yearly` | TRY 4,199.99 | 3 | 3 |

Apple price points do not provide exact TRY 280.00 or TRY 380.00 tiers. The nearest
available App Store price points are used. All four products are available in 175
territories and are in the `Logivya Subscriptions` group.

## Server configuration

- Production notification URL: `https://www.logivya.com/api/billing/apple/notifications`
- Sandbox notification URL: `https://www.logivya.com/api/billing/apple/notifications`
- Production database migration: `20260804190000_apple_app_store_subscriptions`
- Production deployment contains the Apple purchase, restore, and notification APIs.

## Build

- Version: `1.0`
- Build: `165`
- Marker: `IOS_EMAIL_REGISTRATION_APPLE_IAP_RELEASE_V165`
- EAS build ID: `c3f801f7-73e0-4432-a34e-4068fc2e1518`

## Required before App Review resubmission

1. Wait for build 165 to finish App Store Connect processing.
2. Install build 165 through TestFlight on a real iPhone.
3. Verify email registration without a phone number.
4. Verify Starter purchase, Professional purchase, and Restore Purchases in sandbox.
5. Capture the real iPhone subscription screen and upload it as review metadata for all four products.
6. Attach all four subscriptions and build 165 to iOS version 1.0.
7. Reply to App Review with the corrected behavior and resubmit.

Do not resubmit build 163. Do not submit build 165 before the real-device checks and
subscription review screenshot are complete.

## App Review reply draft

Hello App Review Team,

Thank you for the review. We addressed both issues in build 165.

For Guideline 5.1.1(v), a phone number is no longer required during iOS registration.
Users can register and sign in using only their email address. Phone information is not
requested by the iOS registration flow.

For Guideline 3.1.1, paid digital subscriptions on iOS are now offered exclusively through
Apple In-App Purchase. The iOS app contains no IBAN, bank-transfer instructions, external
purchase link, external payment request, or call to action for purchasing outside the App
Store. Existing subscribers can sign in, and new users can register and purchase Starter or
Professional subscriptions through the App Store. Restore Purchases is also available.

The Starter subscription supports up to two user accounts and two WhatsApp connections. The
Professional subscription supports up to three user accounts and three WhatsApp connections.
Review credentials and a connected WhatsApp test account remain available
in App Review Information.

Kind regards,
Logivya

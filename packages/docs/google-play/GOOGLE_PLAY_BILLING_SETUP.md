# Google Play Billing Setup

This document is the operational source of truth for Logivya Android subscriptions.

## Application

- Package: `com.logivya.mobile`
- Billing library: `expo-iap`
- Purchase verification: server-side Android Publisher API
- Notifications: Google Play real-time developer notifications (RTDN)

## Subscription Products

| Product ID             | Base plan | Period  | Price in Turkiye |
| ---------------------- | --------- | ------- | ---------------: |
| `logivya_starter`      | `monthly` | 1 month |          TRY 280 |
| `logivya_starter`      | `yearly`  | 1 year  |        TRY 3,000 |
| `logivya_professional` | `monthly` | 1 month |          TRY 380 |
| `logivya_professional` | `yearly`  | 1 year  |        TRY 4,200 |

All base plans are auto-renewing. Product and base plan IDs are immutable production contracts and must match `src/server/billing/google-play-products.ts`.

## Catalog Automation

- Audit current Play Console products: `npm run google-play:subscriptions:audit`
- Print the immutable local catalog without contacting Google: `node scripts/google-play/configure-google-play-subscriptions.mjs --print-config`
- Create missing products and activate their base plans: `npm run google-play:subscriptions:configure`

Run the configure command only after a billing-enabled AAB has reached a Google Play test track. The script converts prices for all available Play regions, preserves the exact TRY prices listed above, and refuses to rewrite conflicting active base plans.

## Server Configuration

- `GOOGLE_PLAY_BILLING_SERVICE_ACCOUNT_JSON`: raw or base64-encoded service-account JSON. The account must be linked to Play Console and authorized for the Logivya app.
- `GOOGLE_PLAY_RTDN_VERIFICATION_TOKEN`: random server secret used on the RTDN push endpoint.
- RTDN endpoint: `https://www.logivya.com/api/billing/google-play/notifications?token=<secret>`

Do not expose either value to the mobile application or commit credentials to the repository.

## Release Checklist

1. Paid app agreement, payments profile, bank account, and tax information are complete in Google Play Console.
2. Both subscription products and all four base plans are active with the prices above.
3. The service account can call Android Publisher subscription APIs for `com.logivya.mobile`.
4. The Pub/Sub topic accepts notifications from Google Play and pushes to the production RTDN endpoint.
5. Database migrations and production environment variables are deployed.
6. A new Android closed-test AAB is installed from Google Play.
7. A license tester completes monthly purchase, restore, renewal-state, cancellation, and account-isolation tests.
8. Production rollout is started only after the closed-test evidence passes.

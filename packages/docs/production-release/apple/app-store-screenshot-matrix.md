# App Store Screenshot Matrix

Status: `PLAY STORE PARITY ASSETS READY FOR APPLE-SIZE GENERATION`

The iOS configuration has `supportsTablet: true`. Therefore both iPhone and iPad screenshot sets are required before App Review.

## Required source sizes

| Device family | Preferred portrait source | Requirement |
| --- | --- | --- |
| iPhone 6.9-inch | `1320 x 2868`, `1290 x 2796`, or `1260 x 2736` | Provide 1-10 screenshots; highest-resolution set can scale down |
| iPad 13-inch | `2064 x 2752` or `2048 x 2732` | Required because the app runs on iPad |

Use one accepted size consistently within each uploaded set. Verify the current values against Apple's Screenshot Specifications immediately before upload.

## Approved Play Store parity sequence

The eight Turkish explanatory screenshots published to Google Play are the approved source set for iOS `1.0.7`. They are stored under `packages/docs/google-play/store-assets-v178/` and must be adapted without generative text changes. Before App Review, verify every frame against the unified navigation, consolidated WhatsApp workspace, Telegram workspace, and combined vehicle workspace; do not show Facebook Pages as public while provider review is pending.

1. Communication workspace overview
2. Group and category organization
3. Message workflow planning
4. Immediate, scheduled, and recurring delivery
5. In-app support
6. Subscription and usage status
7. Notification preferences
8. Account security

## Product capture sequence for a later marketplace-specific refresh

1. Login without real credentials. The iOS build must not show registration.
2. Dashboard with synthetic workspace data.
3. WhatsApp account connection status without QR codes, pairing codes, phone numbers, or session data.
4. Groups and contacts using synthetic names and numbers.
5. Message composer with synthetic content.
6. Scheduling and repeat controls.
7. Message history without private message content.
8. Support or privacy/account controls.

## Safety rules

- Never show real customer names, phone numbers, groups, messages, emails, QR codes, pairing codes, tokens, invoices, or support content.
- Do not imply features that are unavailable in the submitted binary.
- Capture light and dark mode only when both are polished; do not mix modes within a set without design review.
- Verify all iPhone and iPad layouts on the exact TestFlight candidate.
- App previews are optional and are not planned for the first submission.

Official references:

- https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots

# App Store App Privacy Details

This is the engineering source of truth for the App Store Connect App Privacy form for iOS 1.0 builds 163 and 164. Apple requires disclosure when a data type may be collected, including optional collection and collection by third-party SDKs. Final form submission remains an Account Holder/legal decision.

The published App Store Connect form was visually verified on 2026-08-03. It declares 16 data types, all linked to the user's identity and none used for tracking.

## Global answers

- Data used to track the user: **No**.
- Data linked to the user's identity: **Yes** for the categories below. Diagnostics and product interaction are treated as linked conservatively because the release can associate diagnostics with a Logivya user ID and SDK-generated identifiers.
- Third-party advertising: **None**.
- Developer advertising or marketing use: **None**.
- Data sale: **None**.

## App Store Connect selections

| Apple category and data type | Collected | Linked | Tracking | Purpose | Evidence |
| --- | --- | --- | --- | --- | --- |
| Contact Info - Name | Yes | Yes | No | App Functionality | Account, company, invitation, and support profiles |
| Contact Info - Email Address | Yes | Yes | No | App Functionality | Login, verification, account notices, invitations, support |
| Contact Info - Phone Number | Yes | Yes | No | App Functionality | Profile, company, WhatsApp pairing and account identity |
| Contact Info - Physical Address | Yes | Yes | No | App Functionality | Company and invoice profile address |
| Contacts | Yes | Yes | No | App Functionality | Authorized WhatsApp contact and group synchronization |
| Purchases - Purchase History | Yes | Yes | No | App Functionality | Subscription, plan, payment request, invoice and entitlement history |
| User Content - Emails or Text Messages | Yes | Yes | No | App Functionality | User-authored WhatsApp messages, schedules, delivery state and history |
| User Content - Customer Support | Yes | Yes | No | App Functionality | Support tickets, replies, and user-provided attachment URLs |
| User Content - Other User Content | Yes | Yes | No | App Functionality | Group names, categories, templates, campaign content and workspace data |
| Identifiers - User ID | Yes | Yes | No | App Functionality | Account, tenant, session, audit and authorization identifiers |
| Identifiers - Device ID | Yes | Yes | No | App Functionality | Mobile session security, trusted device, push token registration |
| Usage Data - Product Interaction | Yes | Yes | No | Analytics | Optional Firebase screen and feature events; preference defaults off |
| Diagnostics - Crash Data | Yes | Yes | No | App Functionality | Optional Sentry crash reporting, redacted and disabled by default |
| Diagnostics - Performance Data | Yes | Yes | No | App Functionality | Optional Sentry traces and release diagnostics |
| Diagnostics - Other Diagnostic Data | Yes | Yes | No | App Functionality | Minimal root-recovery digest, route, platform, app/build and recovery ID |
| Other Data - Other Data Types | Yes | Yes | No | App Functionality | Company, team, tax, role, workspace configuration and operational metadata not covered by another Apple data type |

## Categories not collected by the iOS app

- Payment Info: card or bank credentials are not collected by the app. Declare Purchase History instead.
- Precise Location and Coarse Location.
- Health, Fitness, Browsing History, Search History, Sensitive Info, Advertising Data, and Other Financial Info.
- Photos or Videos, Audio Data, Gameplay Content, and Hands unless a future release adds a direct upload or capture feature.

## SDK and operational notes

- Firebase Analytics collection is controlled by the in-app Product Analytics preference and defaults to disabled.
- Sentry collection is controlled by the Diagnostics preference and defaults to disabled. `sendDefaultPii` is false and events are redacted, but the enabled path can set the Logivya user ID; declare the data as linked.
- The minimal `/api/observability/client-events` recovery event is sent independently of Sentry consent and is therefore disclosed as Other Diagnostic Data.
- Expo push tokens and local device identifiers are linked to the authenticated user and workspace for notification delivery and security.
- WhatsApp contacts and message content are processed only for an account the customer authorizes and are not used for advertising or tracking.
- Approved account deletion removes or anonymizes eligible data. Narrow records may remain where law, fraud prevention, disputes, security, backups, or an active legal hold require retention.

## Manual verification before saving the form

1. In App Store Connect, open **App Privacy** and ensure every row above is present.
2. For every declared data type, select **No** for tracking.
3. Do not select advertising purposes.
4. Confirm the privacy policy URL is `https://www.logivya.com/privacy-policy` and Privacy Choices URL is `https://www.logivya.com/account-deletion`.
5. Save and publish the privacy answers only after the Account Holder confirms the legal wording and current production processor configuration.

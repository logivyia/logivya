# Google Play Production Access Audit - 2026-08-03

Status: `CLOSED TEST TECHNICALLY READY / PRODUCTION ACCESS TIME GATE ACTIVE`

This document is the current engineering source of truth for package
`com.logivya.mobile`. It supersedes version-specific v136 preparation notes.

## Executive Result

- Closed test release: `166 (1.0.136)`
- Closed test track: `Kapali Test ` (the Console/API track name contains a
  trailing space)
- Release status: `completed`
- Production track releases: `0`
- AAB SHA-256:
  `FA817520C648FA4FFA090E0D0F9D76EF71250D0ACE2E9FE85F688FAABC3C49D0`
- Upload certificate SHA-256:
  `90:ED:68:41:02:50:0A:91:50:46:DF:80:4E:9D:B4:04:CA:61:39:58:19:DC:8D:D0:25:AC:08:5D:71:FA:6B:A0`
- Default store language: `tr-TR`
- Store listings: `tr-TR`, `en-US`
- Test participation: the owner reports more than 12 opted-in testers and
  approximately 7 continuous days as of 2026-08-03. The Publishing API does
  not expose email-list opt-in duration, so the Play Console dashboard remains
  authoritative for the exact day counter.

No production release was created. Updating the bundle on the same closed-test
track does not change tester membership; the requirement is continuous tester
opt-in, not continuous use of one version code.

## Completed Engineering And API Work

- Removed the Android in-app manual bank-transfer/IBAN purchase path for
  digital subscriptions. The Google Play build is consumption-only: users can
  view an existing organization plan but cannot buy a subscription or digital
  upgrade in the app.
- Preserved subscription entitlement/status checks and the stable
  WhatsApp/message core.
- Built and signed Android `166 / 1.0.136` against the production API.
- Verified package name, version, minimum SDK 24, target/compile SDK 36,
  release signing, non-debug mode, cleartext disabled, backup disabled and all
  four supported ABIs.
- Verified no broad storage/media, advertising ID or AdServices permissions.
- Verified no embedded secret and no staging/local API endpoint.
- Uploaded v166 to the existing closed-test track and verified the Play-side
  bundle hash after commit.
- Changed the Play default listing language to Turkish.
- Published real Turkish and English store copy.
- Published one icon, one feature graphic, eight phone screenshots, two
  7-inch tablet screenshots and two 10-inch tablet screenshots in both
  locales.
- Preserved store contact data:
  `support@logivya.com`, `https://www.logivya.com`, phone ending `5142`.
- Verified public HTTP 200 responses for:
  `https://www.logivya.com/privacy-policy`,
  `https://www.logivya.com/terms-of-service`,
  `https://www.logivya.com/kvkk`, and
  `https://www.logivya.com/account-deletion`.

## Review Account

Use this account in Play Console > Policy and programs > App content > App
access:

- Email: `appstore-review@logivya.com`
- Password: enter only in Play Console; never store it in source control
- Access: all app functionality requires authentication
- User status: active and email verified
- Password change required: no
- MFA: no; company MFA policy is none
- Role: owner with one active company membership
- Plan: Professional, active through 2027-01-27
- WhatsApp: one dedicated review account is connected; phone ends `5142`

Before applying for production, test the exact Console password in a fresh
signed-out Android session. The password cannot be read or tested through the
database. App access instructions should say:

> Sign in with the supplied review account. No OTP or MFA is required. The
> account has an active Professional review plan and a dedicated connected
> WhatsApp account. Do not pair a personal WhatsApp account. The reviewer can
> inspect the dashboard, connection status, groups, messaging, message history,
> team management, subscription status, support, settings and the account
> deletion entry point.

## App Content Answer Matrix

The Developer Publishing API cannot read or submit the private App content and
Data safety forms. A direct Console inspection on 2026-07-19 showed the
privacy policy, ads, content rating, government, financial, health,
advertising-ID and Data safety sections saved. Re-open each section before the
production-access application and keep these answers:

| Section            | Required answer                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy     | `https://www.logivya.com/privacy-policy`                                                                                                                                  |
| App access         | All or some functionality is restricted; enter the review account above                                                                                                   |
| Ads                | No                                                                                                                                                                        |
| Target audience    | Adults/business users only; select 18 and over, not children                                                                                                              |
| Content rating     | Business/productivity messaging; answer private user-to-user messaging truthfully; no public social feed, violence, sexual content, drugs, gambling or simulated gambling |
| News app           | No                                                                                                                                                                        |
| Government app     | No                                                                                                                                                                        |
| Financial features | No financial features; SaaS entitlement metadata is not banking, lending, trading, a wallet or financial advice                                                           |
| Health apps        | No health features                                                                                                                                                        |
| Advertising ID     | No                                                                                                                                                                        |
| Account deletion   | In-app deletion entry plus `https://www.logivya.com/account-deletion`                                                                                                     |
| Category           | Application / Business                                                                                                                                                    |
| Payments           | Consumption-only; no digital purchase or external payment CTA in the Android app                                                                                          |

## Data Safety Baseline

Keep the published declaration aligned with actual optional features and
production providers. The conservative inventory is:

- Personal information: name, email, phone and physical/company address.
- Contacts: WhatsApp contact/group data supplied through the connected
  business account. Android device contacts permission is not requested.
- User content: emails/text messages, support content and other user-provided
  content.
- Identifiers: user ID and device ID.
- Purchases: existing subscription/purchase history and entitlement metadata.
- App activity: product interaction when analytics consent is enabled.
- Diagnostics: crash, performance and other diagnostic data when diagnostics
  consent is enabled.
- Other data required for account, security, messaging and support operations.

Use purposes that actually apply: App functionality, Account management,
Security/fraud prevention, Customer support and optional Analytics. Data is
encrypted in transit, data is not sold, cross-company advertising tracking is
not performed, and deletion is available in-app and on the public deletion
page. Service providers must be answered according to Google's current
"sharing" exemptions and the production provider inventory.

## Closed-Test Evidence

Production telemetry for the 14-day window ending 2026-08-03 shows:

- 15 distinct authenticated Android users
- 87 distinct Android device IDs
- 413 Android mobile session rows
- 270 refresh-token usage events
- Latest activity: 2026-08-03 19:06 Europe/Istanbul
- Active Android push users/devices: 1 / 1
- In-app feedback submissions: 0

This proves real authenticated usage, but it does not prove Play opt-in
continuity and it is not a substitute for genuine tester feedback. Do not
manufacture feedback. During the remaining test period, keep at least 12
testers opted in continuously and ask them to update to v166, use real safe
workflows and submit honest private Play feedback or in-app feedback.

Recommended tester pass:

1. Install/update from the closed-test Play link and sign in.
2. Open dashboard, profile, users/team and subscription status.
3. Confirm the dedicated WhatsApp connection and user-owned groups only.
4. Send a safe message to an authorized test recipient.
5. Verify message history and Delete for Everyone.
6. Open support/settings and verify the account-deletion entry point without
   deleting the shared test account.
7. Submit concise genuine feedback describing what was tested, any problem and
   device/Android version.

Do not remove testers, opt them out, close the test, create a new testing list
or move the release to another track before the production-access counter is
complete.

## Production-Access Application Draft

Use only statements that remain true on the submission date.

### How testers were recruited

> We invited adult testers directly to a private Google Play closed test. The
> testers represent the intended business-user workflow and trusted test
> participants. More than 12 testers remained opted in continuously throughout
> the required period.

### Tester engagement

> Testers installed the app from Google Play and exercised authenticated
> production-like workflows on multiple days, including sign-in, dashboard,
> company/team views, subscription status, dedicated WhatsApp connection
> status, safe test messaging, message history, Delete for Everyone, settings,
> support and account-deletion discovery. Our server telemetry recorded 15
> distinct authenticated Android users during the 14-day observation window.

### Feedback and collection method

Do not submit this answer until genuine feedback exists:

> Feedback was collected through Google Play private tester feedback, the
> in-app feedback/support flow and direct follow-up with testers. Testers
> reported [insert truthful themes]. We addressed [insert actual changes] and
> retested the affected workflows in build 166.

### Intended audience

> Logivya is for adults who own or work in businesses and need to manage
> company-authorized WhatsApp connections, contacts/groups, messaging
> workflows, team access, support and account status from a mobile device. It
> is not designed for children or general social networking.

### User value

> The app gives authorized business teams a single secure mobile workspace for
> viewing company-owned communication connections, organizing groups and
> contacts, sending and reviewing messages, managing team access and monitoring
> subscription/support status. Tenant isolation and role-based access keep one
> company's data separate from another.

### Changes made from testing

> Testing led to stronger production API response handling, authentication
> recovery, subscription and users-screen reliability, phone-number pairing
> validation, invited-member Delete for Everyone support, Turkish localization
> and Google Play payments-policy compliance. Build 166 removes external/manual
> digital subscription payment instructions from Android while preserving the
> stable WhatsApp/message core.

### Production readiness

> Build 166 is a signed non-debug Android App Bundle targeting API 36. It uses
> production HTTPS endpoints, contains no broad storage or advertising-ID
> permissions, provides public privacy and account-deletion pages, includes a
> full reviewer account, and passed authentication, tenant-isolation, message
> delivery, Delete for Everyone, history and release-bundle regression checks.

For the first-year install estimate, select the smallest Console range that
honestly includes the current business forecast. Engineering evidence cannot
determine a commercial forecast.

## Remaining External Gates

These cannot be completed by code or the Publishing API:

1. The Play Console must show at least 12 opted-in testers for 14 continuous
   days. The owner currently reports approximately 7 days.
2. Testers must provide genuine feedback. The in-app production table currently
   contains zero Android feedback submissions; Play private feedback is visible
   only in Console.
3. On day 14, re-open every App content section, test the review password in a
   fresh session, then use Dashboard > Apply for production.
4. Google reviews the production-access application. Approval time and result
   are controlled by Google; another testing period can be required if
   engagement or answers are insufficient.

## Repeatable Evidence Commands

```powershell
node scripts/google-play/audit-publishing-state.mjs
npx tsx --env-file=.env.production.local scripts/google-play/audit-review-account.ts
npx tsx --env-file=.env.production.local scripts/google-play/audit-closed-test-engagement.ts
node scripts/release/verify-android-bundle.mjs --aab "logivya-v166-1.0.136-google-play-consumption-only-policy-ready.aab" --bundletool ".local-android/tools/bundletool-all-1.18.1.jar"
```

## Official References

- Production access testing requirements:
  https://support.google.com/googleplay/android-developer/answer/14151465
- App content setup:
  https://support.google.com/googleplay/android-developer/answer/9859455
- Payments policy:
  https://support.google.com/googleplay/android-developer/answer/9858738
- Target API requirements:
  https://support.google.com/googleplay/android-developer/answer/11926878
- Account deletion:
  https://support.google.com/googleplay/android-developer/answer/13327111
- Content ratings:
  https://support.google.com/googleplay/android-developer/answer/9898843
- Target audience and children:
  https://support.google.com/googleplay/android-developer/answer/9867159

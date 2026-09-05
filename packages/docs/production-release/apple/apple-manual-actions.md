# Apple Manual Actions

## 1. App Store Connect app record

Completed and API verified on 2026-07-19:

- Apple ID: `6792539737`
- Name: `Logivya`
- Bundle ID: `com.logivya.mobile`
- SKU: `LOGIVYA001`
- Primary language: English (U.S.)
- iOS version: `1.0`, Prepare for Submission

Do not create another App ID or app record.

## 2. Firebase iOS configuration

In the existing Firebase project, register or select the iOS app with bundle ID `com.logivya.mobile`. Download `GoogleService-Info.plist` and place it locally at:

```text
apps/mobile/GoogleService-Info.plist
```

The file is ignored by Git. Confirm it belongs to the correct Firebase project and bundle ID; do not rename another app's plist.

## 3. Agreements and account status

In App Store Connect, check **Business > Agreements**. The Account Holder must resolve any pending agreement, tax, or banking action that blocks TestFlight or App Review. Do not accept legal terms on the Account Holder's behalf without approval.

## 4. App Store metadata

Complete, with product/legal approval:

- App name, subtitle, description, keywords, support URL, marketing URL, and privacy policy URL
- iPhone/iPad screenshots matching supported device families
- App Privacy data collection and tracking answers
- Age rating questionnaire
- Export compliance encryption answers
- Content rights and third-party service disclaimer
- Review notes describing WhatsApp account connection and test steps
- Dedicated App Review account credentials entered only in App Store Connect

Use `app-store-metadata.json`, `app-privacy-questionnaire.md`, `app-store-screenshot-matrix.md`, and `app-review-account.md` as review inputs. They are drafts, not authorization to submit.

## 5. TestFlight testers

Use Internal Testing first when testers are App Store Connect users. For other testers, create an External Testing group; the first external build may require Beta App Review. Do not add production customers until the internal smoke test passes.

## 6. Public release

TestFlight approval does not authorize public release. App Review submission, pricing/availability changes, phased release activation, and public publication each require explicit owner confirmation.

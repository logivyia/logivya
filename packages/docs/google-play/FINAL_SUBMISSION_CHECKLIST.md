# Google Play Final Submission Checklist

Current release: Android `166 (1.0.136)` on `Kapali Test `.

## Build And Distribution

- [x] Package is `com.logivya.mobile`.
- [x] Signed release AAB built and bundletool-validated.
- [x] Minimum SDK 24; target and compile SDK 36.
- [x] Production HTTPS API embedded; no local/staging endpoint or secret.
- [x] Advertising ID, AdServices and broad storage/media permissions absent.
- [x] Four Android ABIs present.
- [x] v166 uploaded to the existing closed-test track as `completed`.
- [x] Play-side bundle SHA-256 matches the local AAB.
- [x] Production track remains empty.

## Store Listing

- [x] Default language is Turkish (`tr-TR`).
- [x] Turkish and English title/short/full descriptions published.
- [x] Turkish and English icon and feature graphic published.
- [x] Eight phone, two 7-inch and two 10-inch screenshots published per locale.
- [x] Contact email, website and new phone number saved.
- [x] Privacy, terms, KVKK and account-deletion URLs return HTTP 200.

## Policy

- [x] Android digital-subscription flow is consumption-only.
- [x] No external/manual bank-transfer purchase CTA in the Android app.
- [x] Review account is active, email verified, MFA-free and fully entitled.
- [x] Dedicated review WhatsApp account is connected.
- [x] App content answer matrix and Data safety inventory documented.
- [ ] Re-open private App content/Data safety forms in Console on submission day.
- [ ] Test the exact Play Console review password in a fresh signed-out session.

## Closed Test And Production Access

- [x] Owner reports at least 12 opted-in testers.
- [x] Production telemetry shows 15 distinct Android users in the last 14 days.
- [ ] Play Console must reach 14 continuous days; owner reports about 7 days on
      2026-08-03.
- [ ] Testers update to v166 and submit genuine private/in-app feedback.
- [ ] Apply for production access from the Play Console dashboard on day 14.
- [ ] Answer application questions using
      `PLAY_CONSOLE_PRODUCTION_ACCESS_AUDIT_2026-08-03.md`.
- [ ] Wait for Google's production-access decision before creating a production
      release.

Do not remove testers, opt them out, close the current test or move to another
track while the continuous-testing counter is active.

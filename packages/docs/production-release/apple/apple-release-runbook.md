# Apple Release Runbook

## Release gates

1. Repository and credential checks pass.
2. App Store Connect audit returns one matching app record.
3. EAS iOS validation passes.
4. Firebase iOS configuration is present locally.
5. Typecheck, lint, secret scan, and relevant stable-core tests pass.
6. EAS-managed signing credentials are reviewed.
7. A physical-device TestFlight test passes.
8. The owner explicitly approves App Review submission.

## TestFlight acceptance matrix

Run with multiple accounts and at least two physical iPhones where possible:

- Clean install and update install
- Email/password login, logout, and session restore; verify that iOS exposes no registration route
- Password validation and MFA flow when enabled
- WhatsApp QR and phone-code connection
- Connection persistence after backgrounding, force close, network loss, and backend/worker restart
- Own-account group and contact isolation
- Group and contact synchronization with saved names
- Immediate, scheduled, and repeated message sending
- Message history and delivery state
- Delete for Me and Delete for Everyone
- Category creation, editing, group/contact assignment
- Support ticket creation, thread reply, and notification flow
- Subscription and team-seat entitlements
- Push notification permission, delivery, deep link, foreground, background, and cold-start behavior
- Turkish/English, dark/light mode, phone/tablet layout

Record build ID, tester, device, iOS version, time, result, and evidence for every case. Any failed critical flow blocks App Review.

## App Review submission

Before the final action:

1. Confirm the selected build ID and version.
2. Confirm privacy, age rating, export compliance, review notes, and review account.
3. Confirm no production outage or open P0 incident.
4. Obtain explicit owner approval.
5. Submit in App Store Connect and record the submission timestamp/status.

Use phased release for the first public release where Apple permits it. Monitor authentication, WhatsApp connection, message delivery, deletes, crashes, and support tickets during rollout.

## Rollback and build replacement

- A TestFlight build cannot be replaced with the same build number. Increment `IOS_BUILD_NUMBER` and rebuild.
- Remove a bad build from tester groups; do not delete audit evidence.
- If a submission is still editable, remove it from review before changing metadata or build selection.
- If a released version is defective, pause phased release when available and prepare a higher build/version; App Store binaries cannot be rolled back in place.
- Revoke credentials only for proven exposure or explicit credential rotation.

## Current decision

Status: **GO FOR 1.0.7 (178) BUILD AND APP REVIEW SUBMISSION**.

Version `1.0.6` build `176` is `READY_FOR_SALE`. The next candidate is version `1.0.7` build `178`, created from the same unified-master mobile source verified for Android internal build `204`. Identity, metadata, public URLs, Firebase, ATS, EAS profile, unified prompt tests, release-blocking mobile tests, and stable WhatsApp/message core checks pass. Submit only after the new binary is built, uploaded, processed, attached to the `1.0.7` version, and the existing approved screenshot, privacy, review-account, agreement, and subscription information is verified for the new version.

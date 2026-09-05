# Logivya Production Release Current-State Audit

Audit date: 2026-07-17

Audit baseline: Android `129 (1.0.99)`, repository commit
`5e4ab25fd8b339a724155d12cfcbd09a25e8c411`, production Web alias
`https://www.logivya.com`.

This report records repository and observed production evidence. A successful
build, an internal-test upload, or a signed AAB is not treated as public-release
approval.

## Release decision

Public Google Play release: **BLOCKED**.

Apple App Store release: **NOT READY**.

The Play-installed Android v129 build remains the observed internal-test
baseline. The source changes described below are not a new release artifact.
No rollout percentage or public track may be changed without explicit owner
approval.

## Confirmed stable baseline

- Baseline source of truth is `main` at `origin/main`. The current release-
  hardening worktree contains intentional, uncommitted changes and is therefore
  not yet a reproducible release input. Two local backup ZIP files are
  intentionally untracked and are never release inputs.
- Production Web health endpoint returns HTTP 200.
- Production notification processing uses the approved no-new-cost Vercel cron
  mode and has a recorded healthy heartbeat.
- Latest production migration evidence remains
  `20260717090000_enterprise_notification_platform`. The additive
  `20260717210000_release_governance_center` migration exists in source, passed
  Prisma validation and the read-only migration safety audit, but has not been
  applied to production.
- The protected stable-core tests, mobile typecheck, Web build, Android release
  build, bundle validation and signing verification passed for v129.
- Google Play delivered v129 as an update to a physical Samsung SM-A165F. The
  package remained `com.logivya.mobile`, installer remained Google Play and
  application data was preserved.
- v129 AAB SHA-256 is
  `5641DFB383371E4E1F485F876D0DFACDD1F801398B8F9B9E73E6D87ED7677603`.
- v129 upload certificate SHA-256 is
  `90:ED:68:41:02:50:0A:91:50:46:DF:80:4E:9D:B4:04:CA:61:39:58:19:DC:8D:D0:25:AC:08:5D:71:FA:6B:A0` and matched v128.

## Android artifact audit

Bundletool output for the actual v129 AAB confirms:

- package: `com.logivya.mobile`
- versionCode: `129`
- versionName: `1.0.99`
- minSdk: `24`
- targetSdk: `36`
- compileSdk: `36`
- cleartext traffic: disabled
- application backup: disabled
- ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`

Target API status is compliant with the currently published Google Play rule
requiring API 35 or later for ordinary app updates after 31 August 2025.

### Published v129 and source-candidate distinction

The merged manifest inside the already-published v129 AAB contains permissions
not represented in the earlier permission inventory:

- `READ_EXTERNAL_STORAGE`
- `READ_MEDIA_IMAGES`
- `WRITE_EXTERNAL_STORAGE`
- `com.google.android.gms.permission.AD_ID`
- AdServices attribution and advertising ID permissions

The product uses the system document/share flow and server-synchronized
WhatsApp contacts; no broad photo/storage or device-contact permission is
required. This mismatch does not disappear from the AAB already delivered by
Google Play.

The current source candidate removes all seven broad-storage, screen-capture,
advertising ID and AdServices permissions at manifest merge time. It also sets
Firebase analytics/ad storage, user data, personalization and screen reporting
defaults to disabled. A Gradle release manifest merge completed successfully on
2026-07-17; merged manifest SHA-256 is
`5FCF11FA5737BC061757127C8F6244E1B82DFF8423CBE2B00DDD228C7E8F1C40`.
The merged candidate retained package `com.logivya.mobile`, v129/1.0.99,
`allowBackup=false` and cleartext disabled. This is source validation only, not
a Play-uploadable replacement for v129.

The authenticated startup hook now registers a push token silently only when
notification permission was already granted. A new permission prompt is shown
only through the explicit user action on the notification education/settings
surface.

Verified Android App Links are not complete. The custom `logivya://` scheme is
implemented, but there is no production `assetlinks.json` containing the Google
Play app-signing certificate fingerprint. The upload-key fingerprint must not be
used as a substitute.

Play Integrity is not implemented. It remains a threat-model decision and must
not become the only authentication or authorization signal.

## Google Play Console state

- Application ID: `com.logivya.mobile`
- Current observed track: internal testing
- Current observed release: `129 (1.0.99)`
- v129 was delivered as an update through Google Play.
- The internal-test release was available, but no reusable tester email list was
  selected in the observed tester configuration.
- Store review, app-content declarations, Data Safety, device catalog,
  pre-launch report, countries/regions and production-track readiness still
  require fresh console evidence.
- The app previously displayed a temporary/unreviewed package-based name in the
  internal-test surface. Store listing review remains external work.

## Account deletion

Authenticated Android and Web deletion-request flows exist and use password
reauthentication, exact confirmation text, owner rules and a cancellable queued
job. Destructive execution is intentionally disabled pending dependency-order,
retention, legal-hold and restore tests.

The source now includes a localized public `/account-deletion` route with both
authenticated and support-assisted request instructions. Production deployment
and an external HTTP/browser check of that exact URL remain required before the
Play declaration can be completed.

## Billing policy

Logivya plans unlock cloud software and business-productivity functionality.
Google Play's currently published policy generally requires Play Billing for
in-app sale of this digital service unless a documented exception or eligible
regional program applies. The current mobile flow must remain consumption-only
and must not link or steer users to an external checkout until a signed policy
decision is recorded. Payment-bearing implementation remains intentionally
deferred by the platform owner.

## iOS and App Store state

Expo configuration contains a future bundle identifier, but the repository has
no `apps/mobile/ios` native project and no verified `GoogleService-Info.plist`,
Apple signing identity, provisioning profile, privacy manifest, TestFlight build
or App Store Connect record evidence. No Archive or IPA may be claimed or
generated from this state.

## Store assets and localization

- Text drafts and requirements exist under `docs/google-play` and
  `docs/app-store`.
- Final feature graphic, approved production screenshots and per-locale asset
  evidence are not stored in the release record.
- Ten application locales exist, but a current manual review for long text,
  truncation, legal text, notifications, billing, dates, currencies and
  accessibility has not been attached.
- Documents under `docs/privacy` remain marked `LEGAL REVIEW REQUIRED`; public
  release is blocked until qualified review is recorded.

## Release engineering status

- A protected, manual GitHub Android release workflow now runs localization,
  Prisma, type, lint, Web build, stable-core, privacy, notification, secret,
  preflight, Android bundle and artifact-inspection gates. It does not submit to
  Google Play automatically.
- Additive `Release`, `ReleaseArtifact`, `ReleaseCheck`, `StoreSubmission`,
  `TestExecution`, `Approval` and `RolloutStage` models and migration exist in
  source. Production migration/import evidence is still pending.
- Read-only Release Center views now exist on Web and Android and use backend
  guarded release records rather than client flags. They remain empty until the
  migration is applied and verified evidence is imported.
- Android build metadata now carries release ID, commit, build date and API
  contract version. API requests expose the same diagnostic metadata without
  secrets.
- Preflight enforces clean tracked source, matching commit metadata, HTTPS API
  endpoints, permission policy and a strictly increasing Play version code.
  With observed Play code `129`, candidate code `129` is correctly blocked.
- Signed artifact verification checks package, SDK levels, ABIs, signature
  lineage, forbidden permissions, endpoint markers and embedded secret
  patterns before an artifact can be retained.

## Operations and unresolved production risks

- Latest observed aggregate dependency health was degraded by database/Redis
  latency and WhatsApp accounts requiring attention, while API, queues,
  messaging, support, email, notifications, backups and deployment were
  operational.
- Seventeen support tickets were observed waiting for administrator action.
- Historical worker unhandled-rejection incidents remain open and require
  triage/closure evidence.
- Notification foreground/background/terminated delivery, token rotation,
  logout/user switching and Web Push still need current physical-device/browser
  evidence.
- Mobile production dependencies have no high or critical npm advisory. Two
  moderate transitives (`postcss` and `uuid`) affect the Expo toolchain; npm's
  proposed automatic fix is a breaking Expo 57 upgrade and requires a separate
  controlled SDK migration. Web/backend production dependencies report zero
  npm advisories.
- A complete multi-account WhatsApp release gate, capacity evidence and
  first-hour/24-hour/72-hour/one-week operator assignment are not attached to
  this release.

## Implemented low-risk scope

The following repository changes are justified without modifying the stable
WhatsApp/message core:

1. Corrected Android permission and analytics-default mismatches in source.
2. Made notification permission contextual and kept silent registration only
   when permission was already granted.
3. Added the public account-deletion resource.
4. Added safe build metadata and Android release preflight/artifact checks.
5. Added a protected manual Android release workflow and retained evidence.
6. Added a structured, read-only Release Center backed by release records.
7. Updated store-compliance evidence from the verified source candidate.

## Current release blockers

1. Legal documents still require qualified review and approval.
2. Store screenshots, feature graphic and locale-by-locale visual evidence are
   not attached to a release record.
3. Google Play Data Safety, app-content, device-catalog, pre-launch, country and
   production-track evidence is not current.
4. The source worktree is not a clean, reviewed commit and release-governance
   migration/import is not deployed.
5. The next Android artifact must use a unique version code greater than 129;
   no final AAB was generated during this audit.
6. Physical Android notification lifecycle and full release smoke evidence are
   incomplete.
7. iOS remains unavailable: no native project, signing, privacy manifest,
   TestFlight build or App Store Connect evidence exists.

No public submission, rollout change, signing-key rotation, payment activation,
Play Integrity enforcement or fabricated iOS artifact is authorized by this
audit.

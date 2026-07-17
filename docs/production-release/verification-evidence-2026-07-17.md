# Logivya Production Release Verification Evidence

Recorded: 2026-07-17

Baseline under review: Android `129 (1.0.99)`, package
`com.logivya.mobile`, repository baseline commit
`5e4ab25fd8b339a724155d12cfcbd09a25e8c411`.

This record separates the Play-installed v129 artifact from the current source
candidate. No new final AAB was generated and no store submission or rollout
was performed.

## Implemented controls

- Removed broad storage/photo, screen-capture, advertising ID and AdServices ID
  permissions from the Android manifest merge.
- Disabled Firebase analytics/ad storage, user data, personalization and screen
  reporting until persisted product-analytics consent permits collection.
- Removed the automatic post-login notification prompt. Silent push-token
  registration now runs only when permission was already granted; a new prompt
  requires an explicit user action.
- Added localized public `/account-deletion` instructions.
- Added release ID, commit, build date and API-contract metadata.
- Added Android preflight, artifact inspection and repository secret scanning.
- Added a protected manual Android GitHub workflow which does not submit to a
  store automatically.
- Added additive release-governance models and a read-only, backend-guarded Web
  and Android Release Center.

No protected WhatsApp pairing, session restore, ownership, queue, worker,
message delivery, history or Delete for Everyone implementation was changed.

## Automated verification

The following commands completed successfully:

- `npx prisma generate`
- `npx prisma validate`
- `npm run i18n:check`
- `npm run typecheck`
- `npm run mobile:typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:stable-core`
- `npm run test:privacy`
- `npm run test:notifications`
- `npm run release:secret-scan`
- Android release preflight with current commit/build metadata and local dirty-
  tree validation override
- Gradle `:app:processReleaseMainManifest` with `NODE_ENV=production` and Sentry
  network upload disabled

The Next.js production build generated 232 pages and included both
`/account-deletion` and `/admin/releases`.

Stable-core verification covered mobile auth resilience, WhatsApp session
persistence, message delivery, continuous delivery, Delete for Everyone and
tenant/group isolation. The group audit reported zero missing owners, ownership
mismatches, duplicate account-scoped group JIDs, foreign category assignments
and foreign message recipients.

Privacy verification passed governance, consent, retention, export and deletion
contracts. Notification verification passed all 97 registered event contracts.
The secret scan inspected 1,150 tracked files and found no repository secret.

The read-only migration safety audit completed before the release-governance
migration was considered. Duplicate, invalid-foreign-key, orphan, WhatsApp
ownership and duplicate group-JID checks all returned zero. The migration was
not applied to production by this audit.

## Android merged-manifest evidence

The final successful manifest merge used current mobile package-lock
dependencies in a non-OneDrive local build mirror. Earlier attempts exposed two
environmental failures which were corrected without changing product behavior:

1. OneDrive presented Gradle plugin Kotlin sources as non-regular placeholder
   files.
2. Sentry source-map upload required a token for a local manifest-only check,
   and the C: drive needed generated-output cleanup.

The successful release manifest evidence is:

- Package: `com.logivya.mobile`
- Version code/name: `129 / 1.0.99`
- Minimum/target/compile SDK: `24 / 36 / 36`
- `android:allowBackup`: `false`
- `android:usesCleartextTraffic`: `false`
- Merged manifest SHA-256:
  `5FCF11FA5737BC061757127C8F6244E1B82DFF8423CBE2B00DDD228C7E8F1C40`

Verified absent:

- `android.permission.READ_EXTERNAL_STORAGE`
- `android.permission.READ_MEDIA_IMAGES`
- `android.permission.WRITE_EXTERNAL_STORAGE`
- `android.permission.DETECT_SCREEN_CAPTURE`
- `com.google.android.gms.permission.AD_ID`
- `android.permission.ACCESS_ADSERVICES_ATTRIBUTION`
- `android.permission.ACCESS_ADSERVICES_AD_ID`

The generated manifest is retained locally under
`artifacts/releases/android-v129-merged-manifest.xml`; the artifacts directory
is intentionally ignored by Git.

This merge proves source behavior only. It does not alter the v129 AAB already
served by Google Play and it is not a new uploadable release.

## Version and update gate

Preflight passed all package, version-consistency, metadata, HTTPS, backup,
cleartext, permission, deletion-resource, Firebase and EAS checks.

When run with observed Play version code `129`, preflight correctly failed this
required check:

`Version code is newer than Google Play: candidate=129, latestPlay=129`

Therefore the next AAB must use a unique code greater than 129. A version bump
is intentionally deferred until the external, legal and physical-device gates
are satisfied, so another unusable AAB is not created prematurely.

## Dependency evidence

- Web/backend production dependency audit: zero advisories.
- Mobile production dependency audit: zero high or critical advisories.
- Mobile audit reports 13 moderate findings through two transitive toolchain
  advisories: `postcss` and `uuid`.
- npm proposes Expo 57 as the automatic forced fix. That is a breaking SDK
  upgrade and is not applied inside a release-hardening change. It requires a
  separately reviewed Expo/React Native migration and full stable-core/device
  regression evidence.

## Release decision

Google Play public release: **BLOCKED**.

Apple App Store release: **NOT READY**.

Remaining blockers include qualified legal review, store graphics and localized
visual evidence, current Play Console declarations/reports, deployment and
external verification of `/account-deletion`, a clean reviewed commit,
production migration/import evidence, physical Android notification lifecycle
tests and explicit owner rollout approval.

iOS has no native project, signing identity, provisioning profile, privacy
manifest, TestFlight artifact or App Store Connect evidence. No iOS artifact is
claimed.

Payment-bearing implementation remains deferred by owner decision. The mobile
app must remain consumption-only and must not steer to an external checkout
until a documented store-policy and legal decision authorizes a compliant path.

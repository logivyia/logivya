# Android Signing and Artifact Recovery

## Current lineage

- Package: `com.logivya.mobile`
- Current local candidate: `versionCode 123`, `versionName 1.0.93`
- Artifact: `logivya-v123-1.0.93-subscription-seat-invitation-trial-governance.aab`
- SHA-256: `ECF8EB76150CA7498B462D8B23F6EF16844E3B7DA6A87E1016CFD98BFD9BFAC0`

Release signing reads `.local-android/credentials/logivya-eas-upload-keystore.properties` or `LOGIVYA_UPLOAD_*` environment variables. `.local-android`, keystores and AAB/APK files are ignored by Git. Release builds fail closed when signing configuration is absent.

## Custody requirements

1. Keep Play App Signing enabled and record the Play app-signing certificate fingerprints in the restricted operations vault.
2. Store the upload keystore, alias and passwords in separate approved secret/recovery custody with at least two authorized operators.
3. Store every accepted AAB plus SHA-256, version, source commit and Play track in private versioned artifact storage.
4. Test recovery on a controlled build host without committing the key.
5. If the upload key is lost, use Google Play upload-key reset; do not change package ID or regenerate the Play app-signing key.

External custody and Play App Signing account settings were not independently proven in this audit. Local possession is not considered a backup.

No AAB is generated for the baseline/backup phase because Android code, API contract and release settings were not changed.

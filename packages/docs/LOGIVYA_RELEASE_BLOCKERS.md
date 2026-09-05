# Logivya Release Blockers

Audit date: 2026-06-16

This document lists only blockers and high-risk items that can prevent a reliable production release.

## Blocker Summary

| ID | Blocker | Severity | Release Impact |
| --- | --- | --- | --- |
| B-001 | Dirty/uncommitted worktree | Critical | Production/GitHub/Vercel may not contain latest work |
| B-002 | Remote identity ambiguity | Critical | Work may be pushed/deployed from the wrong repository |
| B-003 | Missing Firebase native files | Critical | Android/iOS builds or push notifications may fail |
| B-004 | Empty EAS project ID | Critical | EAS builds may not be linked/reproducible |
| B-005 | No verified Android APK/AAB artifact | Critical | Cannot start real Android closed testing |
| B-006 | No verified iOS/TestFlight artifact | High | Cannot start iOS beta |
| B-007 | Real WhatsApp provider UAT pending | High | Core product may fail in production despite code presence |
| B-008 | Scheduled message runtime UAT pending | High | Future-dated campaigns may fail if worker/queue is unhealthy |
| B-009 | Real password reset email delivery pending | High | Account recovery may fail in production |
| B-010 | Push delivery UAT pending | High | Notifications may not reach devices |
| B-011 | Store/legal assets incomplete | Medium | Google Play/App Store submission cannot be finalized |
| B-012 | Admin localization inconsistency | Medium | Turkish product experience remains mixed-language |

## Critical Blockers

### B-001 - Dirty/Uncommitted Worktree

Observed:

- The repository has many modified and untracked files.
- The latest local working tree is not guaranteed to exist on GitHub.
- Vercel production may not reflect the local code.

Impact:

- User sees "nothing changed" after prompts because production may still be running an older commit.
- Mobile build/release work may be lost or invisible to deployment systems.

Required fix:

- Review and stage safe files.
- Exclude secrets and generated artifacts.
- Commit and push to the active remote.
- Verify Vercel deployment.

### B-002 - Remote Identity Ambiguity

Observed actual remote:

```text
https://github.com/logivyia/logivya.git
```

Risk:

- Earlier work referenced `logivya/logivya`.
- Current workspace is configured for `logivyia/logivya`.

Required decision:

- Treat `https://github.com/logivyia/logivya.git` as the current source of truth unless explicitly migrated.
- All pushes/deploys should use the same repository.

### B-003 - Missing Firebase Native Config Files

Observed missing files:

- `apps/mobile/google-services.json`
- `apps/mobile/GoogleService-Info.plist`

Impact:

- Android/iOS native builds may fail.
- Push notifications may not work on real devices.

Required fix:

- Add or securely provide these files through the chosen EAS/Firebase workflow.
- Confirm whether they should be committed or injected securely.

### B-004 - Empty EAS Project ID

Observed:

- `apps/mobile/app.config.js` reads `EXPO_PUBLIC_EAS_PROJECT_ID`.
- Fallback project ID is empty.

Impact:

- EAS builds may not be linked to a stable Expo project.
- OTA/runtime/versioning metadata may be incomplete.

Required fix:

- Link/create the EAS project.
- Set `EXPO_PUBLIC_EAS_PROJECT_ID`.
- Verify `npx expo config` shows a non-empty project ID.

## High-Risk Production Blockers

### B-005 - Android Build Artifact Missing

Impact:

- Closed testing cannot start.

Required fix:

- Run preview APK build first.
- Install on physical Android device.
- Then produce production AAB for Google Play.

### B-006 - iOS TestFlight Artifact Missing

Impact:

- iOS beta cannot start.

Required fix:

- Configure Apple Developer account, bundle ID, signing, and TestFlight build.

### B-007 - WhatsApp Provider UAT Pending

Impact:

- The platform's core promise depends on stable QR, phone-code, group sync, and send flows.

Required tests:

- QR connect.
- Phone-code connect.
- Failed retry.
- Group sync.
- Reconnect.
- Archive/delete.
- Message send.

### B-008 - Scheduled Message Runtime UAT Pending

Impact:

- Future-dated messages may appear queued but fail at execution time if worker/queue is not alive.

Required tests:

- Schedule a campaign 5 minutes ahead.
- Confirm queue job fires.
- Confirm recipient status changes.
- Confirm history and notifications update.

### B-009 - Production Password Reset Email Pending

Impact:

- Users may be unable to recover accounts.

Required tests:

- Existing email receives Resend email.
- Non-existing email does not reveal account existence.
- Wrong code and expired code behave safely.

### B-010 - Push Delivery UAT Pending

Impact:

- Notification center may show entries, but users may not receive device pushes.

Required tests:

- Register device token.
- Trigger notification.
- Validate foreground/background/open behavior.
- Validate unread badge.

## Medium Blockers

### B-011 - Store And Legal Assets Incomplete

Required:

- Final icon.
- Final screenshots.
- Feature graphic.
- Privacy Policy URL.
- Terms URL.
- KVKK URL.
- Google Play data safety form.
- App Store privacy declarations.

### B-012 - Admin Localization Inconsistency

Observed:

- Screenshots show Super Admin sidebar labels in English while platform language is Turkish.

Required fix:

- Replace admin sidebar hardcoded labels with i18n keys.
- Verify Turkish and English mode.

## Release Gate Checklist

No public or closed beta release should happen until:

- [ ] Safe changes are committed and pushed.
- [ ] Vercel production is on the intended commit.
- [ ] Production database migrations are applied.
- [ ] Mobile EAS project ID is configured.
- [ ] Firebase native config is resolved.
- [ ] Android preview APK installs on a real device.
- [ ] Password reset email works in production.
- [ ] WhatsApp QR and phone-code flows work in production.
- [ ] Scheduled campaign sends at due time.
- [ ] Push notification arrives on a real device.
- [ ] Store legal URLs are final.

## Phase 16 Android Real Device Blockers

Re-evaluated on 2026-06-16 for first real Android installation.

### P0

- Missing `apps/mobile/google-services.json`.
- Empty EAS project ID in public Expo config.
- Dirty/uncommitted working tree means EAS/GitHub/Vercel may not build the same code.

### P1

- Production mobile env must be confirmed after EAS project link.
- Push token registration must be tested on a real Android phone.
- WhatsApp QR and phone-code connection must be tested from the preview APK.
- Scheduled message execution must be tested with worker/queue logs.

### P2

- `apps/mobile/GoogleService-Info.plist` is needed before iOS/TestFlight.
- Expo push receipt cleanup should be added before large beta.
- Store assets and legal URLs should be finalized before public release.

Current Android installation readiness: 68%.

## Phase 17 Android Build Execution Status

Re-evaluated on 2026-06-16.

### Commands Run

- `git status --short`: completed; working tree is dirty.
- `npm.cmd run lint`: passed.
- `npm.cmd run typecheck` in `apps/mobile`: passed.
- `npx.cmd expo-doctor apps/mobile`: passed 18/18 after network-enabled retry.
- `$env:APP_ENV='preview'; npx.cmd expo config --type public`: completed.
- `$env:APP_ENV='production'; npx.cmd expo config --type public`: completed.

### Android Config Result

- Android package: `com.logivya.mobile`
- App version: `1.0.0`
- Android version code: `1`
- Preview API URL: `https://www.logivya.com`
- Production API URL: `https://www.logivya.com`
- Preview build profile: APK
- Production build profile: AAB
- Permissions: `INTERNET`, `POST_NOTIFICATIONS`
- App icon, adaptive icon, notification icon, and splash assets exist.

### Remaining P0 Android Blockers

- `apps/mobile/google-services.json` is missing.
- `extra.eas.projectId` is empty.
- Working tree is dirty and should be synchronized before remote EAS build.

### Android-Only Blockers

- Missing `apps/mobile/google-services.json`.
- Preview APK has not been generated.
- Real Android phone install has not been completed.

### iOS-Only Blockers

- Missing `apps/mobile/GoogleService-Info.plist`.
- TestFlight build has not been generated.
- APNs configuration has not been validated.

### Manual Credential Blockers

- Firebase Console access is required to download real Firebase config files.
- Expo/EAS account access is required to run `eas init` and remote builds.
- EAS project ID must be created or linked.

### Phase 17 Readiness

- Android APK readiness: 62%
- EAS readiness: 70%
- Firebase readiness: 45%
- Real device readiness: 60%

## Recommended Release Sequence

1. Git synchronization.
2. Production database migration verification.
3. Vercel deployment verification.
4. EAS/Firebase mobile build unblock.
5. Android preview APK.
6. Physical Android UAT.
7. Production AAB.
8. Google Play closed test.
9. iOS TestFlight.
10. Final store release.

## Phase 19 Android Build Blocker Resolution

Re-evaluated on 2026-06-16 for first preview APK build.

### Verification Commands

- `npm.cmd run lint`: passed.
- `npm.cmd run typecheck` in `apps/mobile`: passed.
- `npx.cmd expo-doctor apps/mobile`: passed 18/18 after network-enabled retry.
- `$env:APP_ENV='preview'; npx.cmd expo config --type public`: completed.

### Confirmed Android Configuration

- App name: `Logivya`
- Android package: `com.logivya.mobile`
- Version name: `1.0.0`
- Version code: `1`
- Preview API base URL: `https://www.logivya.com`
- Preview build artifact: APK through `apps/mobile/eas.json`
- Production build artifact: AAB through `apps/mobile/eas.json`
- Android permissions: `INTERNET`, `POST_NOTIFICATIONS`
- Icon, adaptive icon, notification icon, and splash references are present.

### Remaining P0 Build Blockers

- `apps/mobile/google-services.json` is still missing.
- `extra.eas.projectId` is still empty.
- No Android APK artifact has been generated yet.
- No real Android phone installation test has been completed yet.

### Manual Actions Required

1. Download the real Firebase Android config for package `com.logivya.mobile` from Firebase Console and place it at:

```text
C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile\google-services.json
```

2. Link/create the EAS project from the mobile app directory:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
eas init
```

If the project already exists but is not linked, use:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
eas project:configure
```

3. After Firebase config and EAS project ID are present, start the first installable Android build:

```powershell
cd C:\Users\burak\OneDrive\Desktop\Logivya\apps\mobile
eas build --platform android --profile preview
```

### Phase 19 Readiness

- Android APK readiness: 72%
- EAS readiness: 75%
- Firebase readiness: 45%
- Real device readiness: 60%

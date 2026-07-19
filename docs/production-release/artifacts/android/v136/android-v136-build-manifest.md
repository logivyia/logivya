# Logivya Android v136 Closed-Test Build Manifest

Status: **PLAY CONSOLE CLOSED-TEST RELEASE CANDIDATE, NOT PRODUCTION CERTIFIED**

## Source

- Release branch: `codex/play-console-readiness-v136`
- Source commit: `100bca613f53af6ed50ab9b2f0e243c46e16b12b`
- Tracked worktree before build: clean
- Package ID: `com.logivya.mobile`
- Version: `versionCode 136`, `versionName 1.0.106`
- Build marker: `PLAY_CONSOLE_READINESS_V136`
- Release ID: `android-v136-1.0.106`
- Production API: `https://www.logivya.com`

## Build

- Build date: 2026-07-19
- Build window: approximately 2026-07-19 14:05 UTC to 14:27 UTC
- Command: `gradlew.bat :app:bundleRelease --no-daemon`
- Result: `BUILD SUCCESSFUL` (`exit code 0`)
- Node.js: `24.14.0`
- npm: `11.9.0`
- Java: Eclipse Temurin `17.0.19+10`
- Gradle: `8.14.3`
- Kotlin: `2.0.21`
- Expo SDK package: `54.0.36`
- Sentry source-map upload: disabled locally with `SENTRY_DISABLE_AUTO_UPLOAD=true`; CI upload remains separate
- R8/minification: disabled by release configuration, so no ProGuard mapping file is produced for this build

## Artifact

- File: `logivya-1.0.106-v136-closed-test.aab`
- Easy-upload copy: `logivya-v136-1.0.106-play-console-readiness-play-updateable.aab`
- Size: `60,729,447` bytes
- SHA-256: `44FBECDA483363A9CDB21B510B4434161108D2BA40D26859E86B9616B69F2BE9`
- Upload certificate SHA-256: `90:ED:68:41:02:50:0A:91:50:46:DF:80:4E:9D:B4:04:CA:61:39:58:19:DC:8D:D0:25:AC:08:5D:71:FA:6B:A0`
- Bundletool: `1.18.1`
- Verification report: `android-v136-release-verification.json`
- Merged manifest report: `manifest-merger-v136-release-report.txt`

## Bundle Verification

- Bundletool validation: passed
- JAR signature verification: passed
- Upload certificate lineage: passed
- Minimum / target / compile SDK: `24 / 36 / 36`
- ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- Release debuggable: no
- Cleartext traffic: disabled
- Android application backup: disabled
- Forbidden storage, media and advertising permissions: absent
- Production API endpoint embedded: passed
- Embedded secret scan: no findings

## Automated Release Evidence

- Android release preflight against Play baseline `135`: passed
- Version code uniqueness check (`136 > 135`): passed
- Stable-core regression suite: passed
- Mobile authentication resilience: passed
- WhatsApp session persistence: passed
- Message pipeline and continuous delivery: passed
- Delete for Everyone: passed
- Group and tenant isolation: passed
- Queue recovery: passed
- Admin, subscription, support and MFA tests: passed
- Root and mobile TypeScript checks: passed
- Lint: passed
- Web production build: passed
- Repository secret scan: passed

## Play Console Readiness

The bundle itself is valid and upload-ready. Google Play must still accept unused version code `136`. The store account must also complete the mandatory full-description, financial-features and health-app declarations shown in Play Console before the closed-test release can be saved. Those account declarations are independent of the AAB binary.

## Remaining Closed-Test Evidence

After Play accepts this candidate, a real device must prove the `v135 -> v136` update path, launch, login/session persistence, 2FA, WhatsApp pairing/restore, contact and group sync, message send, Delete for Everyone, support, notifications and background lifecycle. These manual gates block production certification, not creation of this closed-test release candidate.

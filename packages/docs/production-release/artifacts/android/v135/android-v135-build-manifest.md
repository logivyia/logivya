# Logivya Android v135 Closed-Test Build Manifest

Status: **CLOSED-TEST RELEASE CANDIDATE, NOT PRODUCTION CERTIFIED**

## Source

- Release branch: `codex/final-production-readiness-v135`
- Source commit: `95120ccd5997a2af66fd7110dd612904ffc02736`
- Tracked worktree before build: clean
- Package ID: `com.logivya.mobile`
- Version: `versionCode 135`, `versionName 1.0.105`
- Release ID: `android-v135-1.0.105`
- Production API: `https://www.logivya.com`

## Build

- Build date: 2026-07-19
- Build window: 2026-07-19 13:06:42 UTC to 13:37:14 UTC
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

- File: `logivya-1.0.105-v135-closed-test.aab`
- Size: `60,729,440` bytes
- SHA-256: `E4BFEB88497633AA47B6CE61AFC1C26EA167F8AA427DD031F078A078D4507842`
- Upload certificate SHA-256: `90:ED:68:41:02:50:0A:91:50:46:DF:80:4E:9D:B4:04:CA:61:39:58:19:DC:8D:D0:25:AC:08:5D:71:FA:6B:A0`
- Bundletool: `1.18.1`
- Verification report: `android-v135-release-verification.json`
- Merged manifest report: `manifest-merger-v135-release-report.txt`

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

- Android release preflight: passed
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

## Remaining Closed-Test Evidence

This bundle has not been uploaded automatically. Google Play Closed Testing must still confirm that version code `135` is unused and accepted. A real device must then prove clean install, the supplied `v134 -> v135` update path, login/session persistence, 2FA, WhatsApp pairing/restore, contact and group sync, message send, Delete for Everyone, support, notifications and background lifecycle. These manual gates block production certification, not creation of this closed-test release candidate.

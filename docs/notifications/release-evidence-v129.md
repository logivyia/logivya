# Notification Platform Release Evidence - v129

Recorded: 2026-07-17

## Source and deployment

- Implementation commit: `859e9117 Build enterprise notification and privacy platform`
- Android version commit: `e1121b97 Bump notification platform Android release to v129`
- Both commits are pushed to `origin/main`.
- Production Vercel deployment: `dpl_3fN69nHaorTWeBMQtB4k1A2SaPHt`
- Production alias: `https://www.logivya.com`
- Live, Redis and queue probes return `ok`; readiness currently returns `degraded`.
- Production migrations were applied and Prisma reported the schema current.
- Backup workflow run `29555690843` and restore verification completed successfully.

## Automated verification

- Prisma generate and validate passed.
- Root typecheck, lint and production build passed.
- Mobile typecheck passed.
- Notification contract, 97-event registry, tenant-isolation, failure, load, i18n, privacy, monitoring and stable-core suites passed.
- Android `assembleRelease` and `bundleRelease` passed.
- Bundletool validation and standard JAR signature verification passed.
- The AAB scan found no server secret identifier embedded in the release artifact.

## Android artifact

- File: `logivya-v129-1.0.99-enterprise-notification-communication-platform-play-updateable.aab`
- Package: `com.logivya.mobile`
- Version code: `129`
- Version name: `1.0.99`
- Minimum SDK: `24`
- Target SDK: `36`
- ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- SHA-256: `5641DFB383371E4E1F485F876D0DFACDD1F801398B8F9B9E73E6D87ED7677603`
- Signing certificate SHA-256: `90:ED:68:41:02:50:0A:91:50:46:DF:80:4E:9D:B4:04:CA:61:39:58:19:DC:8D:D0:25:AC:08:5D:71:FA:6B:A0`
- The certificate matches the previous v128 release candidate.

## Open release blockers

- Resend production send test failed with HTTP 400 and `API key is invalid`; replace the production key and repeat acceptance/webhook/bounce tests.
- Public SPF currently authorizes Cloudflare mail only. Resend sender-domain verification must be completed and rechecked with DKIM and DMARC evidence.
- The standalone notification worker heartbeat has not been proven in Render; public readiness remains `degraded`.
- No Android device is visible to ADB, so fresh-install/update and foreground/background/terminated notification tests are not proven.
- Actual Web Push subscribe, delivery, revoke and deep-link behavior still requires a signed-in browser/device smoke test.

The AAB is a signed release candidate, not final production acceptance, until these blockers are closed.

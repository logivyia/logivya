# Notification Platform Release Evidence - v129

Recorded: 2026-07-17

## Source and deployment

- Implementation commit: `859e9117 Build enterprise notification and privacy platform`
- Android version commit: `e1121b97 Bump notification platform Android release to v129`
- Cost-free cron processor commit: `38d4cd3d Run notifications in cost-free cron mode`
- All commits are pushed to `origin/main`.
- Production Vercel deployment: `dpl_A1CG8snRES4m71Qz9vNg1C96w7Hb`
- Production alias: `https://www.logivya.com`
- Production release marker: `38d4cd3d9d924ff363de0bbed583b6cb9e8ce787`
- Notification processing uses the existing daily Vercel cron. No new paid Render service was created.
- The production cron returned HTTP 200 and wrote a healthy `cron` processor heartbeat.
- The notification service reports `HEALTHY`, with zero queued, stale, failed or unresolved dead-letter items.
- Overall dependency health remains `DEGRADED` because of existing database/Redis latency and WhatsApp-account attention signals that are outside the notification release.
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
- Production cron authentication was rotated and verified without exposing the secret.
- The Resend production key was rotated. A controlled email from `Logivya <no-reply@logivya.com>` was accepted with HTTP 200 and provider ID `2131d6b3-6e62-468d-90ea-6fb65f074bb6`.

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
- A physical Samsung SM-A165F was connected with Play-installed version `127 (1.0.97)` intact.
- A direct `adb install -r` of the local release APK was correctly rejected with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`: the installed Play build uses Google Play's app-signing certificate while the local APK uses the upload certificate. The app was not uninstalled and user data was not changed.

## Remaining acceptance items

- Public SPF currently authorizes Cloudflare mail only. Resend sender-domain verification should still be rechecked with DKIM, SPF and DMARC evidence even though the controlled production send was accepted.
- The selected no-new-cost cron mode is daily. Durable retries work, but retry latency follows the daily schedule; a continuously running paid worker remains intentionally deferred.
- Play update acceptance from v127 to v129 completed through the Play internal-test track. The installer remained Google Play, the package identity was unchanged and application data was preserved.
- Foreground, background, terminated-state push delivery and logout/user-switch token revocation still require a Play-installed v129 device smoke test.
- Actual Web Push subscribe, delivery, revoke and deep-link behavior still requires a signed-in browser/device smoke test.

The AAB remains a signed, Play-uploadable release candidate. Payment-bearing infrastructure has been intentionally deferred.

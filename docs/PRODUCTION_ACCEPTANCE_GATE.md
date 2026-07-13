# Logivya Production Acceptance Gate

Release state: **blocked until external/manual evidence is attached.**

Compilation is not production proof. A release AAB may be created only after automated checks and real-environment acceptance gates pass.

## Automated Gate

Run:

```bash
npm run release:acceptance
```

This command first runs stable-core contract checks. It then blocks unless these evidence flags are intentionally set after real verification:

- `LOGIVYA_REAL_ANDROID_ACCEPTANCE=passed`
- `LOGIVYA_MOBILE_WEB_ACCEPTANCE=passed`
- `LOGIVYA_DESKTOP_WEB_ACCEPTANCE=passed`
- `LOGIVYA_WORKER_REDIS_ACCEPTANCE=passed`
- `LOGIVYA_DATABASE_ACCEPTANCE=passed`
- `LOGIVYA_PLAY_UPDATE_ACCEPTANCE=passed`

These flags are not shortcuts. They are release-manager acknowledgements that the matching manual or production-like verification has been completed.

## Red-Team Checklist

Try to disprove the release before shipping:

- Can app logout accidentally disconnect WhatsApp?
- Can status polling show stale `AUTH_REQUIRED` while restore is possible?
- Can two workers mutate the same WhatsApp socket/session concurrently?
- Can a recoverable lock/reconnect timeout permanently fail a message?
- Can User A see User B groups or history?
- Can admin groups leak into normal user send targets?
- Can Delete for Everyone run without the original message key?
- Can queue retry create duplicate sends?
- Can Redis outage, worker restart or Render restart leave jobs stuck forever?
- Can Android background/foreground lifecycle make the app show stale connection state?
- Can Play Console reject the release as not updatable because versionCode, package id, signing lineage, SDK/device coverage or ABI filters changed?

Any "yes" blocks release.

## Google Play Update Gate

Before uploading:

- `applicationId` matches the existing production app.
- Signing key lineage matches previous accepted AABs.
- `versionCode` is strictly higher than the latest Play Console active version.
- `versionName` follows the existing release sequence and does not downgrade expectations.
- `minSdkVersion`, `targetSdkVersion`, ABI filters and feature declarations do not reduce supported device coverage.
- Bundle contains expected ABI splits.
- Play Console pre-review shows no "previous devices no longer supported" error.

## Long-Run Stability Gate

Run or observe a production-like worker long enough to verify:

- Worker heartbeat remains fresh.
- Redis memory and queue depth stay bounded.
- Stuck jobs are recovered.
- Reconnect jobs do not storm.
- Socket count does not grow without bound.
- Session restore works after worker restart.
- Messages sent during reconnect remain retrying and later deliver.

## Current Blockers

The repository can provide static and automated evidence. It cannot by itself prove:

- Real Android device QR and phone pairing.
- Real WhatsApp delivery to an external group.
- Real Delete for Everyone on an already delivered message.
- Production Redis/worker health over hours.
- Target database ownership audit against live data.
- Google Play Console device coverage/updatability screen after upload.

Do not generate or publish the final release AAB until these blockers are resolved and documented.

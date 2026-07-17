# Mobile and Web SDK Privacy Audit

Status: `LEGAL REVIEW REQUIRED`

## Inventory

| SDK/service | Platform | Potential data | Default behavior | Required action |
| --- | --- | --- | --- | --- |
| Expo / React Native | Android | App/device metadata needed for runtime | Required runtime | Review Expo subprocessor terms and network destinations |
| Expo Notifications | Android | Push token and minimal payload | Permission/runtime gated | Keep message/contact content out of payloads |
| Firebase Analytics | Android | Allowlisted usage events and app metadata | Disabled by privacy preference default | Confirm provider region, retention and deletion support |
| Sentry | Android/Web | Redacted diagnostics and internal identifier | Disabled by diagnostics preference default; PII off | Confirm DSN environment, sampling, region and DPA |
| Next.js/Vercel telemetry path | Web/server | Request and operational metadata | Platform infrastructure | Confirm provider log retention and regional processing |
| Cloudflare R2 client | Server only | Client-side encrypted backup/export objects | Private, server-side use | Separate least-privilege credentials and lifecycle rules |
| AWS S3-compatible SDK | Server only | Encrypted privacy export bytes | No client bundle use | Keep secrets server-only and rotate credentials |

## Permission findings

The verified source-candidate merge requests notification permission plus
technical network, wake/boot, biometric storage and launcher-badge permissions.
It does not request contacts, camera, location, advertising ID, AdServices ID or
broad storage access. WhatsApp contacts are synchronized server-side; device
contact permission must not be added for that feature. The already-published
v129 AAB predates the source permission removal and is tracked separately in the
production release audit.

## Release check

For every Android release, compare the merged manifest, dependency lockfile, network destinations and Google Play Data Safety inventory. A new SDK or permission requires a renewed review before AAB publication.

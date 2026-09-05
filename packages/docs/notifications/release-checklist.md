# Notification Release Checklist

## Code and data

- [x] Prisma migration safety report reviewed and production backup verified.
- [x] Schema migration applied before notification worker deployment.
- [x] Typecheck, lint, build and notification/stable-core suites pass.
- [x] Cross-tenant, failure-simulation and load tests pass.

## Providers

- [ ] Email provider and sender configured.
- [ ] SPF, DKIM and DMARC verified with recorded evidence.
- [ ] Email webhook signature and bounce/complaint tests pass.
- [ ] Expo/EAS production credentials and physical-device push pass.
- [ ] VAPID configuration and Web Push subscribe/revoke pass.

## Operations

- [ ] Notification worker deployed and heartbeat healthy.
- [ ] Queue/dead-letter/provider alerts active.
- [ ] Admin event, delivery, template, announcement and provider pages verified on Web and Android.
- [ ] Announcement preview and typed confirmation tested.

## Android release

- [x] Production API URL/package/signature verified.
- [ ] Fresh install and upgrade from current Play build pass.
- [ ] Foreground/background/terminated push, deep link, logout and user switching pass.
- [x] Version code/name incremented and signed release-candidate AAB generated.
- [ ] Publish the release candidate only after every unchecked provider, worker and physical-device gate passes.

Evidence and current blockers are recorded in `release-evidence-v129.md`.

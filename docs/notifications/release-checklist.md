# Notification Release Checklist

## Code and data

- [ ] Prisma migration safety report reviewed and production backup verified.
- [ ] Schema migration applied before notification worker deployment.
- [ ] Typecheck, lint, build and notification/stable-core suites pass.
- [ ] Cross-tenant, failure-simulation and load tests pass.

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

- [ ] Production API URL/package/signature verified.
- [ ] Fresh install and upgrade from current Play build pass.
- [ ] Foreground/background/terminated push, deep link, logout and user switching pass.
- [ ] Only then increment versionCode/versionName and generate the signed AAB.

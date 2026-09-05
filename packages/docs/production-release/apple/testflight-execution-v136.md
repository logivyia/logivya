# TestFlight Execution Evidence - 1.0 (136)

## Candidate identity

- Bundle ID: `com.logivya.mobile`
- EAS build ID: `d770c759-bbfc-4cc7-adb6-ca38a7e7fa7e`
- App Store Connect build ID: `5ccd2e83-7618-4769-a85e-56ea201bb6e5`
- EAS submission ID: `bdc52140-218b-4a20-ab18-5dcb69f7642a`
- Internal group ID: `7664d31e-aebc-4d99-a5af-0af5ee2df91e`
- IPA SHA-256: `FAC287A1F6F57A23DF6DEEF67BB14A8A3B653496B0C55B6A2D22C047FFC6D5FB`

## Automated evidence

- [x] EAS production build finished.
- [x] Xcode archive succeeded.
- [x] App Store Connect accepted the binary.
- [x] Apple processing state is `VALID`.
- [x] Internal build state is `IN_BETA_TESTING`.
- [x] Production APNs entitlement is embedded.
- [x] App Store profile contains no provisioned device list.
- [x] Debug entitlement is disabled.
- [x] Firebase bundle ID matches the application bundle ID.
- [x] App privacy manifest exists in the IPA.
- [x] Internal group is linked to the exact build.
- [x] Public TestFlight link is disabled.
- [x] First internal tester is invited.

## Codex acceptance run - 2026-07-20

The following checks were executed against the repository, the production web/API surface, App Store Connect, and the exact uploaded iOS candidate. No stable WhatsApp/message core file was modified during this run.

- [x] Root TypeScript check: `npm run typecheck`
- [x] Mobile TypeScript check: `npm --prefix apps/mobile run typecheck`
- [x] ESLint: `npm run lint`
- [x] Next.js production build: `npm run build` (234 routes/pages generated)
- [x] Full baseline suite: `npm run test:baseline`
- [x] Stable-core contracts: mobile auth resilience, WhatsApp session persistence, message pipeline, continuous delivery, Delete for Everyone, and group isolation
- [x] Queue recovery, admin authorization, subscriptions, support, category/contact assignment, password policy, MFA, localization, security, audit, and observability contracts
- [x] WhatsApp contact PN/LID compatibility, team contact isolation, mobile admin parity, support email payloads, and smart schedule parsing
- [x] Notification platform contracts (97 registered events)
- [x] Privacy/consent/retention/export/deletion contracts
- [x] Monitoring health, alert, failure simulation, integration, and load contracts (100,000 evaluations)
- [x] Prisma schema validation
- [x] Repository secret scan (1,176 tracked files)
- [x] Production API smoke: public, database, Redis, worker, and mobile-version health endpoints returned HTTP 200
- [x] Production authorization smoke: unauthenticated user/admin/support/send endpoints returned HTTP 401 as expected
- [x] Production mobile-login contract: iOS-shaped invalid login reached the backend and returned HTTP 401 with `UNAUTHORIZED`
- [x] Mobile web acceptance at 390x844: login/register/home had no horizontal overflow and no browser console errors
- [x] Desktop web acceptance at 1440x900: home rendered without horizontal overflow or browser console errors
- [x] App Store Connect API identity audit: Logivya app `6792539737`, bundle `com.logivya.mobile`, build `1.0 (136)`
- [x] TestFlight status: build processing `VALID`, not expired, exact internal group present, public link disabled
- [x] External TestFlight group `Logivya External Beta` created and linked to build 136
- [x] External beta description, feedback address, review contact, and tester instructions stored without committing secrets
- [x] Beta App Review submission accepted by Apple; state `WAITING_FOR_REVIEW` / `WAITING_FOR_BETA_REVIEW`
- [x] IPA integrity recheck: 21,089,267 bytes; SHA-256 matches `FAC287A1F6F57A23DF6DEEF67BB14A8A3B653496B0C55B6A2D22C047FFC6D5FB`

### Production evidence and limits

- Ownership audit: 23 WhatsApp accounts and 153 groups; zero missing owners, cross-account group ownership mismatches, duplicate group JIDs, foreign category assignments, or foreign message recipients.
- Delivery evidence: two recipients were `SENT` in the preceding 24 hours and the related immediate campaign was `COMPLETED`.
- Current status snapshot contained no `CONNECTED` WhatsApp account. Therefore this automated run does not claim live pairing, live socket persistence, or a new end-to-end WhatsApp send from build 136.
- Apple reports one active App Store profile for the candidate signing identity. An older superseded profile is invalid; the uploaded build remains `VALID` and in internal testing.
- App Privacy answers and account agreements remain manual App Store Connect checks.
- The one-person public TestFlight link remains disabled until Apple approves external beta testing.

## Physical-device acceptance

Record device model, iOS version, tester, timestamp, result, and sanitized evidence for every row.

- [ ] Fresh install and cold launch
- [ ] Register, login, logout, and session restore
- [ ] WhatsApp QR pairing and phone-code pairing
- [ ] Background, foreground, force-close, and network-loss recovery
- [ ] Own groups and contacts only; no tenant leakage
- [ ] Group send and contact send
- [ ] Scheduled and repeated message send
- [ ] Message history and delivery state
- [ ] Delete for Me and Delete for Everyone
- [ ] Category create, edit, and assignment
- [ ] Support ticket create, thread, reply, and status
- [ ] Notification allow, deny, foreground, background, and tap navigation
- [ ] Turkish and English; dark and light mode
- [ ] Small and large iPhone layout
- [ ] iPad portrait and landscape layout
- [ ] Upgrade installation and session/data continuity

## Release decision

App Review and public release remain blocked until every critical physical-device row passes with no open P0 or P1 issue.

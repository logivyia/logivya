# Web and Mobile Parity Matrix - V138

Backend behavior is the source of truth. `implemented` means the workflow and shared API contract exist; it does not replace real-device acceptance for native operating-system behavior.

| Feature | Web status | Mobile status | Backend status | Entitlement | Role | Remaining gap | Release action | Test coverage |
|---|---|---|---|---|---|---|---|---|
| Dashboard WhatsApp groups | implemented | implemented | explicit owned/sendable group metric | active account access | member | real production data smoke test | verify counts on the same tenant | contract, typecheck, device smoke |
| Dashboard contacts | implemented | implemented | explicit tenant/user contact metric | `contactMessaging` | member | large-directory device performance | verify Professional and non-Professional accounts | entitlement contract, contact tests |
| WhatsApp accounts | implemented | implemented | shared account APIs | plan/account access | member | none introduced by this release | stable-core smoke | stable-core suite |
| Group synchronization | implemented | implemented | worker/backend owned | account access | member | live WhatsApp provider dependency | stable-core smoke | sync/contact suites |
| Contact directory | implemented | implemented | canonical scoped `Contact` rows | `contactMessaging` | member | provider name availability | verify names and tenant isolation | contact suite |
| Message sending | implemented | implemented | queue/worker owned | server entitlement | member | live-provider acceptance | do not alter stable core | stable-core suite |
| Delete for Everyone | implemented | implemented | stored message key and worker owned | server permission | member | provider deletion window | do not alter stable core | stable-core suite |
| Subscription summary | implemented | implemented | canonical serializer | none | member | payment checkout remains web-led | show backend state only | subscription suite |
| User management | implemented | implemented | company seat and invitation APIs | seat entitlement | owner/admin | advanced billing remains web-led | use `Kullanıcıları yönet` | subscription/team tests |
| MFA enrollment | implemented | implemented | shared MFA endpoints | none | authenticated user | real authenticator/device check | device acceptance | enterprise MFA suite |
| MFA login with TOTP | implemented | implemented | pre-session challenge | none | user | real clock-skew check | device acceptance | enterprise MFA suite |
| MFA login with recovery code | implemented | implemented | one-time recovery verification | none | user | real-device consumption check | device acceptance | web/native contract tests |
| Trusted devices | implemented | implemented | server-owned device records | none | user | push/device identity variance | device acceptance | MFA contract tests |
| Session management | implemented | implemented | server-owned session revocation | none | user | concurrent-device smoke test | device acceptance | MFA contract tests |
| Security navigation | implemented | implemented | authenticated endpoints | none | user | none | keep native `Güvenlik` drawer item | static contract |
| Admin visibility | implemented | implemented | server `isAdmin`/guards | none | super admin | detailed native admin views remain partial | verify authorized and normal users | admin regression suite |
| Support center | implemented | implemented | tenant/user ticket APIs and admin guards | none | member/admin | notification timing is provider-dependent | smoke ticket and reply | support tests |
| Notifications | implemented | implemented | shared notification APIs | none | user | native delivery needs device lifecycle test | Android/iOS acceptance | notification tests |
| Offline behavior | browser standard | best effort | no offline authorization | none | user | mutations require network | show recoverable errors | network smoke |

## Release QA checklist

- [ ] Web, mobile web, Android, and iOS login with password only.
- [ ] MFA enrollment QR, confirmation, recovery-code display, and secure storage warning.
- [ ] Login once with TOTP and once with a recovery code; confirm recovery code cannot be reused.
- [ ] Revoke one trusted device, one session, and all other sessions.
- [ ] Confirm dashboard group count equals accessible synchronized groups, not participants.
- [ ] Confirm `Kişiler` is present for Professional and absent without `contactMessaging`.
- [ ] Confirm Turkish auth/security text has no corrupted characters or raw internal codes.
- [ ] Confirm WhatsApp connect, group sync, message send, history, and Delete for Everyone.
- [ ] Confirm a normal user cannot see another tenant's contacts, groups, sessions, or admin data.
- [ ] Verify Android upgrade from the currently published test build and iOS TestFlight update.

## Rollback

If dashboard/API behavior regresses, redeploy the previous web release and retain the additive database state. If a native regression is found, pause the affected test rollout and promote the last verified build; Play/App Store version numbers are never reused. No destructive migration is part of this release. WhatsApp sessions, contacts, groups, messages, subscriptions, and MFA credentials are preserved.

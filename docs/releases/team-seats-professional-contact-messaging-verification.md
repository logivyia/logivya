# Team Seats + Professional Contact Messaging Verification

Date: 2026-07-11

## Release decision

**HOLD - do not deploy migrations or generate the Play Console AAB yet.**

The implementation and isolated PostgreSQL verification pass, but the production Neon database rejects even read-only audit queries with `Your project has exceeded the data transfer quota`. Production data safety therefore cannot be proven yet.

## Implemented architecture

- One authoritative company subscription supplies entitlements to every active company member.
- Trial reserves one total seat, Starter two total seats, and Professional three total seats.
- Pending invitations reserve seats until accepted, declined, revoked, or expired.
- Invitation create/accept/revoke/decline operations serialize on the company row with `FOR UPDATE`.
- Invitation tokens use 32 random bytes and only their hashes are stored.
- Existing users can accept after login; new users register directly into the invited company without receiving a separate trial subscription.
- Removing a member and revoking that member's web/mobile company sessions occur transactionally.
- Contact records are scoped by company, user, and exact WhatsApp account.
- Contact list endpoints enforce Professional/full-trial access, pagination, bounded server search, active filtering, and sorting.
- The message pipeline persists explicit `GROUP` and `CONTACT` target types and supports mixed campaigns.
- The worker rechecks company entitlement, user/account ownership, active contact state, and WhatsApp reachability before contact delivery.
- Delete for Everyone uses the original typed target JID and stored message key while preserving the stable group branch.
- Web and mobile expose contact search, visible selection, selected counts, refresh, empty/error/loading states, and paginated loading.

## Migration safety

Migration:

`prisma/migrations/20260711152000_team_seats_professional_contact_messaging/migration.sql`

The migration is additive, does not update `Subscription` rows, backfills contact ownership from the owning WhatsApp account, backfills existing recipients as `GROUP` or `CONTACT`, and validates a database check constraint that prevents ambiguous typed targets.

The repository's historical migration directory has no schema-creation baseline; a fresh `prisma migrate deploy` stops at the oldest migration because it assumes `AccountStatus` already exists. To test the real upgrade shape safely, the committed v110 Prisma schema was pushed into an isolated PostgreSQL 16 database, then the pending support migration and team/contact migration were applied. `prisma migrate diff` reported **No difference detected** against the current schema.

The local migration audit returned `safeToMigrate: true` with zero findings for:

- duplicate memberships
- missing active owner memberships
- multiple current subscriptions
- orphan/mismatched/duplicate contacts
- contacts whose WhatsApp account has no owner
- ambiguous or missing message targets
- cross-company/cross-user group and contact recipients
- legacy invited memberships
- expired pending invitations

Production audit is still blocked by the Neon transfer quota. No production migration was attempted.

## Executed verification

- `npx prisma validate` - passed
- `npx prisma generate` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm run build` - passed, 162 routes/pages generated
- `apps/mobile: npm run typecheck` - passed
- `npm run test:seven-day-trial` - passed
- `npm run test:team-contact-messaging` - passed
- `npm run test:team-contact-messaging:integration` against isolated PostgreSQL 16 - passed
- `npm run test:team-contact-messaging:api` against local production Next server - passed
- Stable core contract, session persistence, message pipeline, Delete for Everyone, and continuous delivery tests - passed
- Stable core production group audit - blocked only by the same Neon transfer quota
- Android `:app:assembleRelease` - passed from a short physical Windows path with `NODE_ENV=production`, Sentry upload disabled, and sufficient Gradle metaspace
- APK signature - verified with one RSA signer
- APK package - `com.logivya.mobile`, versionCode `110`, versionName `1.0.80`
- APK native ABIs - `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`

The Android APK was a temporary compile proof and was removed with the staging directory. It is not a release artifact.

## Proven scenarios

- Starter owner can reserve one invited seat; a second invite is rejected.
- Professional owner can reserve two invited seats; a third invite is rejected.
- Pending acceptance becomes an active membership without increasing total reserved seat usage.
- A downgraded/full plan cannot be overfilled during invitation acceptance.
- Non-owner invitation creation is rejected.
- Invited member resolves the company's plan without an individual subscription.
- Removed member loses membership and active company session.
- Starter contact list and manually submitted contact campaign both return HTTP 403 with `CONTACT_MESSAGING_REQUIRED`.
- Professional owner and invited member each receive only their own account contacts.
- Supplying another member's WhatsApp account ID does not expose contacts.
- Invited member message history does not expose owner campaigns.
- The database rejects a recipient containing both `groupId` and `contactId`.
- Existing group pipeline and Delete for Everyone contract checks remain present and passing.

## Advertising specification gap

The schema already has `advertisingEnabled`, but no authoritative customer-facing attribution text or delivery rule is defined. No attribution was invented or appended in this change. Product must define the exact text, locale behavior, retry idempotency, and legal requirements before Starter advertising can be implemented consistently.

## Required release unblocks

1. Restore/upgrade/reset the Neon data-transfer allowance.
2. Run `npm run audit:migration-safety`, `npm run audit:team-contact-migration`, and `npm run audit:whatsapp-groups` against production.
3. Confirm `prisma migrate status`, back up production, and apply pending migrations only if all audits are clean.
4. Deploy web and worker together, then repeat authenticated Starter/Professional API smoke tests against production.
5. Verify invitation acceptance, contact sync/send, mixed delivery, history, and Delete for Everyone on a real Android device plus mobile/desktop web.
6. Only then increment beyond versionCode 110, generate the signed AAB, verify signer/package/ABIs, and upload to Play Console.

# Production Release Checklist

## Before merge

- [ ] Scope and stable-core impact reviewed; CODEOWNERS approval obtained.
- [ ] No secrets, signing files, dumps, sessions or customer data are tracked.
- [ ] Prisma migration is additive/backward compatible and safety audit passes.
- [ ] `npx prisma generate`, `npx prisma validate` and isolated `migrate deploy` pass.
- [ ] `npm run typecheck`, `npm run mobile:typecheck`, `npm run lint`, `npm run build` and `npm test` pass.
- [ ] Queue recovery, snapshot restore and tenant-isolation tests pass when protected paths change.
- [ ] A verified encrypted production backup exists in primary and secondary storage.

## Deployment

- [ ] Deploy migration first only when old code tolerates it.
- [ ] Deploy web/API and verify health/auth/current-user/read-only critical APIs.
- [ ] Deploy one worker; verify heartbeat, session restore and queue health before scaling.
- [ ] Verify support, subscription, groups/contacts, send/history and Delete for Everyone with designated test tenants.
- [ ] Watch error rate, reconnects, queue age/depth, failed jobs, database connections and memory.

## Android only when required

- [ ] Android/mobile code, config, API contract or release setting changed.
- [ ] Increment `versionCode` and `versionName`; preserve package/signing lineage.
- [ ] Confirm production HTTPS API config and supported devices.
- [ ] Build signed release AAB, verify signer, compute SHA-256 and store externally.
- [ ] Test upgrade from the current Play internal-test version on a real device.

## Rollback readiness

- [ ] Record source commit, Vercel deployment, Render image/commit, migration and artifact hashes.
- [ ] Confirm schema compatibility of rollback targets.
- [ ] Name incident/release owner and observation window.

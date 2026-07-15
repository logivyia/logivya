# Isolated Restore Runbook

Use this runbook for drills and incidents. Never restore over production in place.

## Preconditions

1. Assign an incident commander and freeze production writes if this is an incident.
2. Select a `VERIFIED` manifest and obtain its matching encrypted archive and encryption-key version.
3. Create an isolated PostgreSQL 17 target with outbound email, notifications, WhatsApp and workers disabled.
4. Record backup ID, incident ID, operator, source timestamp and target identifier. Do not record secrets.

## Verify and restore

```powershell
$env:BACKUP_ENCRYPTION_KEY='<secret from approved recovery custody>'
npm run backup:verify -- --manifest <manifest-path>

$env:RESTORE_CONFIRM_ISOLATED='YES'
$env:RESTORE_DATABASE_URL='postgresql://...@127.0.0.1:5432/logivya_restore'
npm run backup:restore -- --manifest <manifest-path>
```

For a localhost-only Docker target, set `RESTORE_DOCKER_CONTAINER`, `RESTORE_DATABASE_NAME` and `RESTORE_DATABASE_USER`. The restore script rejects Neon hosts and unapproved remote hosts by default.

## Validation

```powershell
$env:DATABASE_URL='<isolated restore database>'
npx prisma migrate status
npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code
npm run audit:database-integrity
npm run audit:whatsapp-groups
```

Compare manifest row counts for User, Company, WhatsAppAccount, WhatsAppSession, WhatsAppGroup, Contact, MessageCampaign, MessageRecipient, SupportTicket and AuditLog. Verify all foreign keys are validated, migration history is complete, session snapshots remain encrypted and no cross-tenant ownership mismatch exists.

## Application smoke

Start a read-only web/API instance against the isolated database. Keep Redis isolated and do not start the WhatsApp worker until using a designated test account. Verify login data, subscriptions, support threads, groups, contacts, categories, campaigns and history. Run `npm test`, type checks and health probes.

## Promotion

Promote only after validation is signed off. Repoint services in this order: database, Redis, web/API, worker. Run durable queue reconciliation before reopening writes. If encryption keys may have been exposed, follow an approved key-rotation plan after service is stable.

## Evidence

Record restore duration, estimated data-loss window, checksums, row-count comparison, smoke results and all deviations in `docs/recovery-verification-report.md` or the incident record.

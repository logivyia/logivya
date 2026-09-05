# Hetzner isolated restore runbook

Updated 4 September 2026. Never restore over the live production database in place.

## Routine verified exercise

On the production host, run `sudo systemctl start logivya-recovery-drill.service`. It downloads the latest signed database manifest/archive from EACH R2 bucket, restores into PostgreSQL 17 with an internal-only Docker network and no published ports, compares eight critical table counts and all non-rolled-back migration counts, then verifies temporary containers/networks/volumes have been removed. A secondary remote file archive is extracted into bounded tmpfs with no network or messaging services. The test fails if production container IDs or restart counts change.

Inspect `sudo systemctl status logivya-recovery-drill.service` and `/opt/logivya/backups/recovery-v1/drill-state.json`. Job errors are kept in the root-only `last-command-error.log`; never paste that file or secret material into public reports. The admin pages expose only the sanitized signed report.

Run a fresh database backup with `sudo systemctl start logivya-postgres-backup.service`; run the file backup with `sudo systemctl start logivya-recovery-files.service`. Refresh evidence with `sudo systemctl start logivya-recovery-evidence.service`.

## Host-loss procedure

1. Obtain a clean isolated Linux host with Docker, Python 3, OpenSSL and jq. Pin PostgreSQL to the digest in `ops/vps/run-isolated-restore-drill.sh` and preserve the backup-tool image/runtime compatibility.
2. Recover the versioned backup key through the existing R2 A + OneDrive B custody procedure. Verify custody HMAC and current key lineage in memory; never print the key. R2 credentials are restricted to the old host IP, so authorize the recovery host through the provider account before download. Do not weaken the production token restriction.
3. List `logivya-backups/recovery-v1/production/postgres/YYYY/MM/DD/` in either private bucket and obtain a signed manifest plus its encrypted archive. If the namespace is unavailable, existing legacy backups remain under `logivya-backups/production/postgres/`. Verify HMAC, encrypted SHA-256 and AES-GCM before use. Select a pre-incident snapshot for logical corruption; latest is not always safest.
4. Run the isolated restore script against the selected encrypted archive and manifest. Confirm signed row counts, migration history and constraints; perform tenant-ownership and read-only application checks in isolation.
5. Recover the matching encrypted files archive. It contains media, Compose, active environment, runtime secrets, release source, recovery tools and image inventory. Extract only on the isolated host. Rebuild/pull the recorded compatible images, restore permissions and provision fresh evidence-signing keys. Do not start application or messaging workers automatically from the archive.
6. Plan queue and in-flight delivery reconciliation, session continuity and TLS/DNS transition. Redis queues and worker session filesystem caches are not a verified byte-for-byte restoration source. Prevent duplicate sends; preserve the stable messaging core.
7. Only after explicit incident promotion authorization and successful checks should services be promoted, traffic reopened, and workers enabled in controlled order. No production promotion is exposed from the admin panel.

## Evidence and rollback

Record selected backup ID and snapshot time, both checksums, key version, isolated target, checks performed, data-loss estimate, database duration and full-service duration separately. Never record user data or keys.

The pre-change systemd units, backup launcher, uploader and Compose file are preserved root-only in `/opt/logivya/backups/pre-recovery-v1-20260904`. Restoring those files is an operator rollback, not a database restore. The web release remains independently rollbackable. Revalidate schedules and report freshness after any rollback.

Known unverified controls: independent-provider data copy, current off-host key reconstruction/cloud custody, complete new-host service restore and PITR. A 30-day lock on the new backup prefix is enabled in both R2 buckets with a dated provider-settings observation. Recheck the provider rules weekly; do not update the observation merely to clear a stale indicator. See [backup-policy.md](backup-policy.md).

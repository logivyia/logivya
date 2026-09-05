# Production backup policy

Verified infrastructure baseline: 4 September 2026, Hetzner production. This supersedes the July Neon/Vercel assumptions.

## Active controls

- `logivya-postgres-backup.timer`: hourly at minute 17 UTC (up to 30 seconds jitter). Consistent PostgreSQL 17 exported snapshot, direct AES-256-GCM encryption, signed manifest, SHA-256 and full readback from both R2 buckets.
- `logivya-recovery-files.timer`: daily 02:27 UTC. Encrypted media, Compose files, active environment file, actual mounted runtime secret files, release source, recovery tooling and image inventory. The backup decryption key and R2 credentials are excluded.
- `logivya-recovery-drill.timer`: daily 03:17 UTC. Both remote database copies are downloaded and independently restored. Eight critical table counts and migration count must match the signed snapshot. Remote file backup is extracted in a network-disabled container using tmpfs. Production container IDs/restart counts must remain unchanged.
- `logivya-recovery-evidence.timer`: signed Ed25519 report every five minutes. Web has a read-only report/public-key mount, no backup credentials. Invalid signatures, reports older than 15 minutes, stopped timers and failed jobs cannot appear verified.
- `logivya-recovery-retention.timer`: daily 04:47 UTC. Requires fresh backup and restore evidence before pruning.

## Retention

New objects under `logivya-backups/recovery-v1/production/` are retained remotely for at least 30 days. Expiry is checked against HMAC-authenticated manifests; objects outside this namespace are never pruned. Local encrypted copies from this namespace are retained for at least 48 hours. The latest local copy is preserved. Legacy backups remain untouched. Weekly/monthly long-term tiers and legal holds are not configured; do not claim otherwise.

## Storage boundaries and remaining work

Two R2 buckets are in the SAME Cloudflare account, using the SAME restricted credential. They protect against a single bucket/object failure but do not provide an independent provider/account boundary. Third-provider copy and separately scoped delete/upload credentials remain outstanding.

On 4 September 2026 at 10:40 UTC, the Cloudflare dashboard showed enabled rule `recovery-v1-production-30d` in BOTH buckets, retaining objects under `logivya-backups/recovery-v1/production/` for 30 days against deletion and overwrite. Other namespaces are unaffected. Authorized Cloudflare account administrators can change these rules; this is not an irreversible compliance lock or an independent ransomware recovery boundary. Existing multipart-abort lifecycle rules were preserved.

The dated observation is stored root-owned at `/opt/logivya/backups/recovery-v1/retention-lock-observation.json`, validated for exact account, both buckets, prefix and duration, then included in the signed report. It is a manual provider-settings review, not continuous API monitoring. Recheck weekly in each bucket's Settings > Bucket Lock Rules and update the observation only after confirming the persisted rule. After seven days, the panel requires another review; regenerating the report cannot refresh the observation date. Missing or invalid evidence never marks the control verified.

The existing two-share key custody record is `artifacts/vps-migration/2026-08-09/backup-key-independent-custody-verification.md`. The OneDrive share exists locally with the recorded digest; cloud availability and current-key reconstruction must be verified before declaring host-loss readiness. Never place full keys or shares in Git, web, logs or evidence reports.

## Scope limits

PostgreSQL `archive_mode` was observed OFF. Logical dumps do not provide PITR. Media is active and included. Redis AOF and worker filesystem session caches are not copied live; durable database state is recovered, and queue/in-flight reconciliation is required before resuming workers. Exact full-service recovery on a new machine remains untested. No outbound alert integration was added; failures are visible in systemd, signed admin evidence and system-health status.

Runbook: [restore-runbook.md](restore-runbook.md). Objectives: [recovery-objectives.md](recovery-objectives.md).

# Disaster recovery overview

Current infrastructure: Hetzner Docker production, PostgreSQL 17, Redis and two Cloudflare R2 backup buckets. Updated 4 September 2026; prior Neon/Render/Vercel assumptions do not describe this deployment.

PostgreSQL is authoritative for durable identity, tenancy, billing, support, encrypted session snapshots, groups, campaigns, message history and scheduling intent. Media files and runtime/release configuration are separately encrypted daily.

Recovery order: recover key custody and provider access; verify selected remote archives; restore PostgreSQL and files in isolation; validate tenant/data integrity; reconcile queues and uncertain deliveries; test web/API without outbound workers; authorize promotion and gradually enable services. Never infer full-service readiness from a successful database restore alone.

Hourly database backup, dual remote readback, daily isolated restore and signed admin evidence are deployed. Targets and limitations are in [recovery-objectives.md](recovery-objectives.md), operational steps in [restore-runbook.md](restore-runbook.md), and retention/access rules in [backup-policy.md](backup-policy.md).

Open controls: a copy with an independent provider/account, cloud-verified key recovery, a new-host full-service exercise, and physical/WAL PITR. Both current buckets share an account and credential. Their 30-day retention lock was verified in the Cloudflare dashboard on 4 September 2026 and requires weekly settings review; see the backup policy. No provider failover or production restore was performed.

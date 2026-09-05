# Recovery objectives

Current basis: Hetzner production, 4 September 2026. Targets are not guarantees of an untested full-service recovery.

| Scope | Objective | Verification |
| --- | --- | --- |
| PostgreSQL and durable customer/message data | RPO at most 90 minutes; hourly logical snapshots | Snapshot age, both remote readbacks and daily isolated restores |
| Media, environment, secrets and release source | RPO at most 26 hours; daily encrypted archive | Remote download and actual network-disabled tmpfs extraction |
| Full service on a new server | RTO target 4 hours | Not yet verified; measured database-drill duration is not service RTO |
| Redis queues and in-flight sends | Reconcile durable database intent before sending | No automatic replay/promotion performed |
| Android signing and store releases | Preserve existing dedicated release custody | Outside this server backup job |

PITR is not enabled. Enabling it requires separately validated physical base backup + WAL archival, retention/disk controls and a planned database configuration change. Do not advertise a 15-minute PITR guarantee based on logical dumps.

Independent-provider copy, off-host key reconstruction and full-service failover remain readiness gaps. Both R2 buckets have a dated 30-day lock-settings verification for the new backup prefix; this manual provider review expires after seven days. Recovery evidence older than 15 minutes is unavailable; a database snapshot older than 90 minutes or files/drill older than 26 hours is stale.

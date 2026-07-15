# Recovery Objectives

These targets are production objectives, not claims that provider settings are already enabled.

| System | RPO | RTO | Basis |
| --- | --- | --- | --- |
| PostgreSQL | 15 minutes with Neon PITR; 24 hours worst case from daily logical backup | 60 minutes | PITR is preferred; logical restore is the independent fallback |
| WhatsApp encrypted snapshots | Near real-time while connected; maximum 15 minutes | 30 minutes | Snapshot on credential/session events plus PostgreSQL recovery |
| Message/support/audit data | Same as PostgreSQL | 60 minutes | Stored in PostgreSQL |
| Object storage | 24 hours | 4 hours | No active binary store today; target applies when enabled |
| Redis cache/locks/heartbeat | 0 durable requirement | 15 minutes | Reconstructable |
| Delayed and recurring queues | 15 minutes | 30 minutes | PostgreSQL intent plus queue reconciliation |
| Web/API | Zero data loss | 30 minutes | Vercel deployment rollback |
| Worker | Zero database data loss; in-flight ambiguity documented | 30 minutes | Render rollback/restart plus session and queue recovery |
| Android artifacts | Zero accepted-release artifact loss | 4 hours | Play Console plus protected artifact copy |

## Provider actions still requiring operator confirmation

- Confirm Neon history retention and scheduled snapshot policy in the production project.
- Enable and confirm Upstash daily backups according to plan capability.
- Configure two independent private S3-compatible backup destinations and lifecycle rules.
- Place Android upload-key recovery material and AABs under approved external custody.

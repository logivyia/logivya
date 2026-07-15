# Production Data Classification

| Class | Examples | Backup and restore | Retention / priority |
| --- | --- | --- | --- |
| Critical durable | Users, companies, memberships, subscriptions, invoices, support, audit logs, WhatsApp metadata and encrypted snapshots, groups, contacts, categories, assignments, campaigns, recipients, message keys, delete metadata, invitations and feature flags | PostgreSQL PITR plus encrypted logical backup and off-provider copy | Restore first; daily 14d, weekly 8w, monthly 12m subject to legal review |
| Legal/financial durable | Payment/invoice references, subscription audit, consent and security events | PostgreSQL plus provider-side records | Retain only for documented tax/security obligations |
| Reconstructable | Dashboard aggregates, derived counts, search caches, metrics that can be recalculated | Rebuild after primary restore | No independent backup unless expensive to rebuild |
| Ephemeral but operational | Redis cache, locks, worker heartbeat, rate counters, active socket registry | Rebuild; do not restore blindly | Minutes/hours only |
| Durable queue intent | Scheduled/recurring campaign definitions and pending recipient states | PostgreSQL is authoritative; reconcile into Redis | Same as campaigns/message history |
| Session disk fallback | Render Baileys session files | Recreate from encrypted database snapshots | Operational cache, not primary backup |
| Source-controlled | Public assets, locale files, templates, infrastructure manifests | Git and release tags | Repository retention |
| Release artifact | Signed AAB and checksum | Protected artifact store plus Play Console | Keep every production release needed for provenance |
| Not currently stored | Support attachment binaries, invoice PDF binaries, private uploads | No active object-store backup until upload service exists | URL references are database data only |

Backups contain personal data. Access requires incident or restore approval, least privilege, audit logging, and deletion/lifecycle review. Raw production dumps may not be committed or left unencrypted on workstations.

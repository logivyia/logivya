# WhatsApp Worker

The worker processes sync, campaign, and recipient jobs through Redis/BullMQ. Tenant identifiers must be present on every job. Sessions are isolated per account and sensitive session data must remain encrypted. Failed jobs should be reviewed from system health before retrying.

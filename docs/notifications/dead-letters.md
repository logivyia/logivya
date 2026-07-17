# Dead Letters

`NotificationDeadLetter` records the outbox/event ownership, channel, safe error code, attempt count and privacy-limited payload required for recovery.

Only backend-authorized platform administrators can list or retry records. The UI does not expose stack traces, provider secrets or raw recipient addresses. Retry requires a resolution reason, writes an audit event and requeues the original durable outbox row.

Dead-letter count and age are monitoring signals. A growing queue, critical security-notification failure or repeated provider-unavailable code requires incident escalation.

# Monitoring Access Control

- Public health routes expose one status field only.
- Detailed health, version, alert and incident APIs require the centralized platform-admin guard. The only accepted platform owner remains `burakidim@gmail.com` through `platform-owner.ts`.
- Internal synthetic access may use `x-logivya-monitoring-token` only when `MONITORING_INTERNAL_TOKEN` is configured. Comparison is timing safe and the token is never returned or logged.
- Monitoring cron requires `CRON_SECRET`.
- Normal users cannot access platform metrics or incidents. Company-level operational views are not exposed by this phase.
- Admin reads are captured by `AdminAccessLog`; incident mutations also write immutable audit records.
- Provider accounts must be read-only and least privilege. GitHub backup status uses public metadata or a read-only Actions token.
- Secrets, raw infrastructure errors and topology are excluded from browser/mobile responses.

Review platform-admin access quarterly and after every incident involving authentication or monitoring credentials.

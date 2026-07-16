# SLO Policy

These are initial operating objectives. Thresholds must be reviewed after 30 days of clean measurements; they are not invented historical performance claims.

| Service indicator | Initial objective | Measurement |
|---|---|---|
| Public API availability | 99.9% monthly | Multi-region uptime check against liveness and a safe API content check |
| Authentication availability | 99.9% monthly | Synthetic non-mutating auth response plus server failures |
| Message queue availability | 99.9% monthly | Redis, worker heartbeat, consumer count and aged work |
| Message delivery reliability | >= 99% excluding permanent customer/provider rejection | Sent / terminal outcomes, separated by target and schedule type |
| Scheduled execution | 99% starts within 5 minutes | Due versus started campaigns |
| Worker heartbeat | 99.95% under 60 seconds | Redis heartbeat age |
| Support persistence | 99.9% | Ticket creation and database persistence |
| Support notification | 99% delivered or retrying within 10 minutes | Outbox age and state |
| Backup freshness | Daily successful verified backup under 36 hours | GitHub backup workflow plus restore verification |

Error-budget burn is evaluated over 1 hour and 6 hours. A fast Tier-0 burn or total outage is SEV-1/SEV-2. Planned maintenance is recorded separately. Customer-caused authentication failures and permanent WhatsApp logout are excluded from platform availability but remain visible as product/account state.

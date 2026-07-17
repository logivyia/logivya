# Retention Schedule

Status: `LEGAL REVIEW REQUIRED`

| Category | Current/proposed period | Trigger/action | Legal hold |
| --- | --- | --- | --- |
| Privacy export object | 7 days | Delete private encrypted object and expire one-time token | Hold blocks deletion if applicable |
| Privacy export job metadata | 90 days proposed | Minimize operational metadata | Hold-aware |
| Privacy request/thread/event | Pending counsel | Close and retain evidence for approved period | Yes |
| Consent evidence | Pending counsel | Preserve purpose/version/decision evidence | Yes |
| Security events | `SECURITY_EVENT_RETENTION_DAYS` | Existing retention job | Yes where linked |
| Audit logs | Pending counsel; append-only design | Restrict/minimize after approved period | Yes |
| Support ticket/attachment | Pending counsel | Separate content and attachment lifecycle | Yes |
| WhatsApp contacts/groups/history | Customer/account lifecycle plus approved operational period | Tenant-scoped deletion/minimization | Yes; stable core and suppression safety required |
| Backup objects | `BACKUP_RETENTION_DAYS` (currently example 14) | Encrypted primary/secondary lifecycle | Restore must replay approved deletion/suppression events |
| Billing/invoice/tax records | Pending statutory review | Restrict access, retain only required fields | Statutory hold |

`runPrivacyRetention` defaults to dry-run. Destructive enforcement requires `PRIVACY_RETENTION_ENFORCEMENT=true`, approved periods, backup, restore test, legal-hold verification and audit evidence.

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
| Customer-owned message history | Account lifecycle pending approved legal schedule | Tenant-only access; never exposed through platform-admin APIs | Yes; customer feature and deletion request rules apply |
| Message delivery/retry queue payload | Completed: 1 hour; terminal failure: 24 hours | BullMQ automatic removal; minimum transient identifiers only | No administrative access |
| Dead-letter delivery metadata | Completed: 24 hours; terminal failure: 7 days | Automatic removal; no message body, recipient phone/JID, caption or raw payload | Restricted incident access only |
| Raw WhatsApp/webhook payload | Do not persist for admin reporting or analytics | Process transiently; retain only approved hashes/status/error categories | Legal exception requires separate review |
| Administrator message analytics | Aggregate status/counts only; period pending counsel | No customer identity, content, recipient, group, contact or exact recipient timestamp | Not applicable |
| Temporary customer export | 7 days | Private encrypted object and one-time token expiry | Hold-aware; no administrator message export |
| Application/worker logs | Configured observability period | Content, phone, JID, contact/group identity and message relationships redacted before emission | Security hold applies only to redacted records |
| Backup objects | `BACKUP_RETENTION_DAYS` (currently example 14) | Encrypted primary/secondary lifecycle | Restore must replay approved deletion/suppression events |
| Billing/invoice/tax records | Pending statutory review | Restrict access, retain only required fields | Statutory hold |

`runPrivacyRetention` defaults to dry-run. Destructive enforcement requires `PRIVACY_RETENTION_ENFORCEMENT=true`, approved periods, backup, restore test, legal-hold verification and audit evidence.

Message privacy policy is codified in `src/server/privacy/message-retention-policy.ts`. Existing customer-owned history is intentionally not deleted by this implementation. Legacy cleanup must first prove that a record is an unnecessary administrator/reporting copy, then pass the destructive enforcement gate above.

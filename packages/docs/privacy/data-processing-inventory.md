# Data Processing Inventory

Status: `LEGAL REVIEW REQUIRED`

This register maps product activities, not merely tables. Final legal basis and retention values require counsel approval.

| Activity | Subjects and data | Source/operation | Recipients/storage | Role proposal | Retention/deletion |
| --- | --- | --- | --- | --- | --- |
| Registration/profile | Users; name, email, phone, locale, timezone | User input; create/update | PostgreSQL, Vercel API | Controller | Account lifecycle plus approved legal exceptions |
| Login/password reset/MFA | Users; identifiers, password hash, tokens, TOTP/recovery material, IP/device events | User/device; verify and secure | PostgreSQL, Redis, email/SMS provider | Controller | Security schedule; secrets rotated/revoked |
| Company/team/invitations | Staff; company identity, membership, role, invitation email | Owner/admin input | PostgreSQL, email provider | Controller | Company lifecycle and invitation expiry |
| Subscription/billing/invoices | Customers; company billing identity, payment reference, invoice data | Customer/provider | PostgreSQL, payment/email providers | Controller | Tax/contract period requires review |
| WhatsApp pairing/session | Account owner; phone identity and encrypted session material | WhatsApp/Baileys | Worker disk, PostgreSQL encrypted snapshot | Processor/controller split | Credentials removed on approved disconnect/deletion; backup handling required |
| Contacts/groups/categories | Recipients and members; phone/JID, names, membership/category | Customer WhatsApp session | PostgreSQL, worker memory | Processor candidate | Customer instruction/account lifecycle; suppression/hold review |
| Campaign/message delivery | Recipients; content, targets, delivery state, message keys | Customer and WhatsApp | Tenant-scoped PostgreSQL, transient Redis, Render worker | Processor candidate | Customer history follows account lifecycle pending legal approval; queue payloads expire 1 hour after success or 24 hours after terminal failure |
| Scheduled/recurring messages | Recipients; content, schedule and target references | Customer | PostgreSQL, Redis | Processor candidate | Cancelled/expired schedule cleanup |
| Delete for Everyone | Recipients; message key and deletion result | Customer request | PostgreSQL, worker | Processor candidate | Minimal evidence; stable core preserved |
| Support | Users/third parties; ticket text, email, attachments | User/admin input | PostgreSQL, email/object provider | Mixed | Closed-ticket and attachment schedule requires review |
| Notifications/email | Users; email/push token and minimal payload | Platform events | Email/Expo providers | Controller/mixed | Delivery metadata schedule requires review |
| Security/fraud/audit | Users/admins; IP, device, event, pseudonymous identifiers | Requests/system | PostgreSQL, logging/monitoring providers | Controller candidate | Configured security retention; legal assessment |
| Analytics/crash diagnostics | Users/devices; allowlisted events, redacted error context | Optional SDKs | Firebase/Sentry | Controller candidate | Disabled until preference; provider retention requires review |
| Backup/restore | All durable records | Automated database dump | Private encrypted R2 primary/secondary | Follows source role | `BACKUP_RETENTION_DAYS`; restore re-deletion procedure |
| Privacy export | Authenticated user; eligible owner-scoped copy | User request | Private encrypted R2 export object | Controller obligation | Object 7 days; metadata 90 days proposed |
| Account/company deletion | User/company records and legal exceptions | Authenticated user/owner request | PostgreSQL job/event register | Controller obligation | Seven-day cancel window; destructive execution disabled pending approval |
| Administrator operations | Users/companies; records needed for support/security/privacy; anonymous message health aggregates only | Platform admin | PostgreSQL audit trail and allowlisted admin DTOs | Controller | Restricted, reasoned and auditable; no customer-authored message content or recipient relationship |

## Data minimization actions

- Optional mobile analytics and diagnostics default to disabled.
- Export omits secrets, raw session material, other users, internal notes and unrestricted payloads.
- Deletion no longer immediately disables a company through legacy endpoints.
- New consent evidence uses purpose-specific status and version fields; raw evidence must remain minimal.
- Contact/group data must never be copied into analytics or another tenant's export.
- Platform administrators receive dedicated allowlist serializers; customer message-history models are never reused in administrator responses.
- Administrator search, activity, notification and company records do not join message operations to account identity, phone, contact, group or exact recipient time.
- Message and recipient payloads are forbidden in logs; message-operation logs de-identify user, company, WhatsApp account and campaign references.
- The legacy `CampaignMetric` schema is not queried by administrator routes. Removal or backfill cleanup remains gated by production data audit, backup, restore verification and legal approval.

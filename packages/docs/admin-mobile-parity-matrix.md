# Logivya Administrator Mobile Parity Matrix

Audit date: 2026-07-13

Authorization source: `requirePlatformAdmin()` and the authenticated backend session. The only accepted platform owner email is the normalized `burakidim@gmail.com`. Mobile visibility uses only the backend `isPlatformAdmin` flag and logout clears tokens, query cache and the runtime admin flag.

Legend:

- `Live`: Android already uses the same protected API as web.
- `Partial`: Android has real data but is missing module-specific presentation or supported actions.
- `Missing API`: web reads directly from Prisma or environment configuration; Android cannot access the authoritative data yet.
- `Read-only`: the repository has no safe backend mutation for this module. Mobile must not invent one.

| Module | Desktop source | Existing Android source | Status before implementation | Required work |
| --- | --- | --- | --- | --- |
| Dashboard | `/api/admin/dashboard` | Same endpoint | Partial | Add explicit metric groups, health/recent activity, refreshed time and failure states. |
| Companies | `/api/admin/companies`, `/api/admin/companies/:id` | List endpoint only | Partial | Search, detail, pagination contract, suspend/reactivate confirmation. |
| Users | `/api/admin/users` | Same endpoint | Partial | Search, pagination, session/device detail and supported account actions. |
| Billing | Server Prisma query | Dashboard endpoint | Missing API | Add currency-aware billing summary and payment rows. |
| Subscriptions | `/api/admin/subscriptions` and action endpoints | List endpoint only | Partial | Filters, detail, manual activation and supported lifecycle actions. |
| Invoices | `/api/admin/invoices` | Same endpoint | Partial | Module fields, search/filter/pagination and detail presentation. |
| Payments | `/api/admin/payments`, mark-paid/reject | List endpoint only | Partial | Search/pagination and protected confirm/reject flows. |
| WhatsApp Accounts | Server Prisma query | Dashboard endpoint | Missing API | Add safe operational read model without credentials or snapshots. |
| Campaigns | Server Prisma query | Dashboard endpoint | Missing API | Add safe campaign operational read model; no duplicate-send action. |
| Support | Shared support service and admin ticket APIs | Same APIs | Live | Preserve thread, reply, priority, status, filters and pagination. |
| Security | `/api/admin/security/events` plus server summary | Events endpoint | Partial | Add summary metrics and module-specific event presentation. |
| Compliance | Server Prisma query | Dashboard endpoint | Missing API | Add consent and data-request summary/read model. |
| Audit Center | Server Prisma query and `/api/admin/activity` | Activity endpoint | Partial | Add immutable audit-specific contract and filters. |
| Activity Center | `/api/admin/activity` | Same endpoint | Partial | Module-specific event rendering and pagination controls. |
| Notifications | Server Prisma query | Activity endpoint | Missing API | Add administrator-safe notification read model. Existing data is user-scoped; no global mark-read mutation exists. |
| Data Requests | Server Prisma query | Activity endpoint | Missing API | Add protected request list and status metadata. Mutations remain read-only until a legal workflow exists. |
| Metrics | `/api/admin/metrics` | Same endpoint | Partial | Accessible metric sections and refreshed/error states. |
| System Health | `/api/admin/system/health` | Same endpoint | Partial | Explicit HEALTHY/DEGRADED/UNAVAILABLE/UNKNOWN states and incidents. |
| Backups | Environment-only web cards | System health endpoint | Missing API | Add provider/readiness status. No restore control exists and none will be fabricated. |
| Disaster Recovery | Static runbook/RPO/RTO web page | System health endpoint | Missing API | Add authoritative readiness/runbook metadata; executable recovery remains unavailable. |
| Settings | No standalone web data page | Dashboard endpoint | Missing API | Add safe operational configuration status, with secrets omitted. |
| Feature Flags | Server Prisma query | Dashboard endpoint | Missing API | Add flag list. Toggle stays read-only until an audited mutation is added. |
| Announcements | Server Prisma query | Activity endpoint | Missing API | Add announcement list. Create/edit/publish remains read-only until a validated workflow exists. |
| API Usage | Server Prisma query | Metrics endpoint | Missing API | Add request volume, latency, status and abuse-safe rows. |
| Webhooks | Server Prisma query | Activity endpoint | Missing API | Add endpoint and latest-delivery read model with origin-only URL and no secret. |
| Platform Settings | Environment-only web metrics | System health endpoint | Missing API | Add shared, masked configuration status and supported plan/locale/currency metadata. |

## Supported mutations

The current backend already supports and audits the following mobile-safe administrator operations:

- Company suspend and reactivate, with a reason and critical-action confirmation.
- User suspend, reactivate, force logout and MFA reset, with a reason.
- Subscription activate, suspend, cancel, extend and change plan, plus manual activation.
- Payment manual confirmation and rejection.
- Support reply, internal note, assignment, priority and status updates.

All other modules remain read-only until a corresponding backend mutation, validation policy and audit trail exist. The mobile client will explain that state instead of rendering fake controls.

## Stable core boundary

This implementation may read administrator-safe WhatsApp and campaign operational records, but it must not modify pairing, credential snapshots, socket restore, queue delivery, worker execution, group synchronization, message history or Delete for Everyone code.

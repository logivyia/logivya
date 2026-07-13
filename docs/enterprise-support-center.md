# Enterprise Support Center

This document is the operational contract for Logivya's persistent, bidirectional support conversation system. The authoritative implementation is under `src/server/support/`; web and mobile routes adapt that shared service instead of implementing separate business rules.

## Authorization

- Any authenticated user may create a ticket.
- A normal user may list, open, read, reply to, close, and mark read only tickets whose `createdById` or legacy `userId` matches the authenticated database user.
- Company ownership does not grant access to another employee's tickets.
- Only the authoritative platform owner resolved by the backend guard may use global support APIs. The current owner identity is centralized in `src/server/auth/platform-owner.ts`.
- Cookie sessions use the web session database record and CSRF origin check for mutations. Mobile bearer tokens are verified against the database-backed device session before the same guard runs.
- Client email, role, query parameters, local storage, and submitted admin flags never grant access.
- Foreign ticket identifiers return not found to prevent enumeration.
- Normal-user responses exclude internal messages.

## Domain Contract

Canonical statuses:

| Status | Meaning |
| --- | --- |
| `OPEN` | Newly opened or explicitly reopened by admin |
| `IN_PROGRESS` | Admin is actively investigating |
| `WAITING_FOR_ADMIN` | Latest public customer action needs support attention |
| `WAITING_FOR_USER` | Latest public admin reply needs customer action |
| `RESOLVED` | Resolution supplied; a customer reply reopens as `WAITING_FOR_ADMIN` |
| `CLOSED` | Final state; customer replies are rejected and admin alone may reopen |

Legacy `PENDING` and `ANSWERED` values remain readable during rollout and are canonicalized to `WAITING_FOR_ADMIN` and `WAITING_FOR_USER`. Legacy `MEDIUM` priority is canonicalized to `NORMAL`.

Priorities are `LOW`, `NORMAL`, `HIGH`, and `URGENT`. Categories are `TECHNICAL`, `WHATSAPP_CONNECTION`, `MESSAGE_DELIVERY`, `DELETE_FOR_EVERYONE`, `ACCOUNT`, `SUBSCRIPTION`, `BILLING`, `TEAM`, `SECURITY`, `FEATURE_REQUEST`, and `OTHER`.

New user tickets start in `WAITING_FOR_ADMIN`. A public admin reply moves the ticket to `WAITING_FOR_USER`; an internal note does not change status. A user reply moves every non-closed ticket, including a resolved ticket, to `WAITING_FOR_ADMIN`.

Public ticket identifiers use `LOG-YYYY-` plus 20 random hexadecimal characters for new records. The migration backfills legacy records with a deterministic 20-character digest. Database primary keys are never used as public navigation identifiers.

## API Endpoints

User web APIs:

- `GET /api/support/tickets`
- `POST /api/support/tickets`
- `GET /api/support/tickets/:publicId`
- `POST /api/support/tickets/:publicId/messages`
- `POST /api/support/tickets/:publicId/read`
- `PATCH /api/support/tickets/:publicId/close`

Android/mobile APIs:

- `GET /api/mobile/support/tickets`
- `POST /api/mobile/support/tickets`
- `GET /api/mobile/support/tickets/:publicId`
- `POST /api/mobile/support/tickets/:publicId/messages`

Platform-admin APIs:

- `GET /api/admin/support/tickets`
- `GET /api/admin/support/tickets/:publicId`
- `PATCH /api/admin/support/tickets/:publicId`
- `POST /api/admin/support/tickets/:publicId/messages`
- `PATCH /api/admin/support/tickets/:publicId/status`
- `PATCH /api/admin/support/tickets/:publicId/priority`
- `PATCH /api/admin/support/tickets/:publicId/assignment`
- `POST /api/admin/support/tickets/:publicId/read`
- `GET /api/admin/support/metrics`

Notification worker:

- `GET|POST /api/cron/support-notifications`, protected by `Authorization: Bearer $CRON_SECRET`

Lists and conversations use cursor pagination with a maximum page size of 50. Admin list filters include status, category, priority, company, user, user email, assignee, unread, unanswered, created range, updated range, and bounded search across public ID, subject, user, and company.

## Atomicity And Idempotency

- Ticket creation, the initial public message, audit event, in-app notification, and notification outbox rows are one database transaction.
- Ticket creation is idempotent on `(createdById, clientRequestId)`.
- Replies are idempotent on `(ticketId, clientMessageId)`.
- A duplicate retry returns the persisted object and does not create another notification.
- Reply and state-change transactions lock the ticket row with `FOR UPDATE`; independent tickets remain concurrent under `READ COMMITTED` isolation.
- Conversation ordering is deterministic by `createdAt` and `id`.
- User and admin unread counters are updated in the same transaction as the message and cleared only when detail/read endpoints are opened.

## Notifications

The database notification and push/email outbox are written transactionally. Request completion never depends on an external email or push provider.

- New ticket and user follow-up notify the platform owner.
- Public admin reply and relevant status changes notify the ticket creator.
- Internal notes never notify or appear to the customer.
- Push deep links open the exact ticket on Android.
- Email delivery is skipped as successfully handled when email is not configured; in-app notification remains available.
- Failed push/email delivery retries up to five times with exponential backoff capped at one hour.
- A processing lease older than ten minutes returns to pending automatically.
- The request path schedules a small immediate drain; Vercel also invokes the cron every five minutes.
- `eventKey` uniqueness prevents duplicate channel delivery during client retries.

Monitor `SupportNotificationOutbox` for `FAILED`, attempts, age of oldest `PENDING`, and expired processing leases. Never log message bodies, credentials, tokens, or attachment contents.

## Database Migration

Apply in order:

1. `20260712213000_enterprise_support_center_enums`
2. `20260712213100_enterprise_support_center_domain`

The first migration commits new PostgreSQL enum values separately. The second migration is additive and data-preserving: it backfills public IDs and message timestamps, maps legacy statuses/priorities, adds idempotency/indexes, creates audit/outbox tables, and optionally creates trigram indexes when `pg_trgm` is permitted.

Before deploy:

1. Run `npx tsx scripts/audit-support-data.ts` against a read-only production connection.
2. Confirm no orphan users, companies, messages, invalid ownership, or duplicate idempotency keys.
3. Take a verified database backup.
4. Run both SQL files against a production-shaped staging clone with `ON_ERROR_STOP=1`.
5. Run `npx prisma generate`, `npx prisma validate`, support integration tests, and the production build.
6. Apply with the approved production migration workflow before routing traffic to code that requires the new columns.

The repository's complete historical empty-database migration chain currently stops at the older unrelated migration `20260612170000_whatsapp_connection_statuses` because that migration expects a missing `AccountStatus` enum. Both new support migrations were separately syntax- and idempotency-tested on PostgreSQL 16. Do not repair or reorder the protected WhatsApp migration history as part of a support release; resolve that historical baseline in a dedicated reviewed database task.

Rollback is application-first: route traffic back to the previous compatible build while leaving additive columns, indexes, enum values, audit rows, and outbox rows intact. PostgreSQL enum values are intentionally not removed. Destructive schema rollback requires a separate backup-verified change window and is not part of the normal rollback path.

## Privacy And Retention

- Support text is rendered as plain text and is excluded from operational metrics and normal logs.
- The platform owner is the only global reader. Normal users remain owner-scoped.
- Account-close endpoints deactivate the company and revoke sessions; they do not immediately destroy support history.
- The company model's default retention setting is 90 days. Support records remain linked by foreign keys during that governed retention period so no orphan records are created.
- This migration does not add an automatic destructive purge. Export, anonymization, and final deletion must run through the approved privacy process after legal retention review and a backup. Deleting a company cascades its tickets/messages/audits/outbox; deleting a user is restricted until retained relationships are safely anonymized or removed.
- Attachments remain URL references in the existing model. A future binary upload feature must add malware scanning, MIME/size enforcement, signed access, and matching retention before activation.

## Operational Evidence

Isolated PostgreSQL 16 and Redis tests on 2026-07-12 proved:

- Unauthenticated create returns 401; invalid category returns 400.
- User A cannot list, open, or reply to User B's ticket.
- A normal cookie or bearer session receives 403 from admin APIs.
- The platform owner can list and open all tenant tickets from web and mobile bearer flows.
- Admin reply persists, appears to the exact user, and user follow-up appears to admin.
- Internal notes do not leak.
- Resolved reply reopens; closed reply is rejected.
- Ticket and reply retries remain single-row and single-notification.
- Read/unread transitions, audit events, cursor pagination, in-app notifications, push/email outbox, and status/priority changes pass.
- Load proof completed 100 concurrent ticket creates, 1,000 list reads, 100 concurrent replies, and a 1,002-message paginated conversation with zero cross-user leaks.
- The user ticket-list query used an index-only scan.

These local results prove implementation behavior, not production deployment. After deploy, run a normal-user/admin smoke conversation, inspect outbox health, and verify Android and web deep links before broad rollout.

## Incident Checklist

1. Capture request/correlation ID, ticket public ID, actor user ID, and HTTP status without copying message text.
2. Verify session/device-session validity and backend authorization result.
3. Confirm ticket ownership and public/internal message visibility in the database.
4. Check audit events and unread counters in transaction order.
5. Check notification/outbox status, attempts, next availability, and provider configuration.
6. Retry only with the original client request/message ID.
7. Never edit a ticket to another user/company or expose an internal note to resolve an incident.
8. Escalate persistent `FAILED` outbox rows, database lock errors, or cross-user results immediately.

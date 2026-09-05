# Account and Company Deletion

Status: `LEGAL REVIEW REQUIRED`

## Implemented safety model

- User deletion and company deletion are separate scopes.
- Current password reauthentication and an exact confirmation phrase are mandatory.
- Company scope requires the active company owner.
- A tracked request and deletion job are created with a seven-day configurable cancellation window.
- Duplicate active deletion jobs are suppressed.
- Users can view and cancel their queued job before `cancelUntil`.
- Legacy endpoints no longer disable a company or revoke sessions; they return `428` and direct upgraded clients to `/api/privacy/account-deletion`.

## Release limitation

Destructive execution is intentionally `false`. Before enabling it, implement and verify dependency ordering, ownership transfer/member treatment, subscription/billing exceptions, queue cancellation, session revocation timing, WhatsApp credential destruction, backup re-deletion, suppression evidence and legal holds. A masked staging rehearsal, backup/restore proof and counsel-approved retention exceptions are mandatory.

# Audit Event Taxonomy

Audit actions are uppercase `DOMAIN_ACTION` values. The controlled core list is exported as `AUDIT_ACTIONS` from `packages/logging`. Legacy dotted actions are canonicalized to uppercase underscore form at the write boundary so historical callers remain compatible.

## Core domains

- Authentication: `AUTH_LOGIN_SUCCEEDED`, `AUTH_LOGOUT`, `AUTH_PASSWORD_CHANGED`, `AUTH_2FA_ENABLED`, `AUTH_SESSION_REVOKED`.
- Company and membership: `COMPANY_UPDATED`, `USER_INVITED`, `INVITATION_ACCEPTED`, `MEMBERSHIP_REMOVED`, `SEAT_ALLOCATED`.
- Billing and entitlement: `TRIAL_STARTED`, `TRIAL_DENIED`, `SUBSCRIPTION_ASSIGNED`, `SUBSCRIPTION_CHANGED`, `SUBSCRIPTION_CANCELED`.
- WhatsApp lifecycle: `WHATSAPP_ACCOUNT_CONNECTED`, `WHATSAPP_ACCOUNT_RESTORED`, `WHATSAPP_RECONNECT_FAILED`, `GROUP_SYNC_COMPLETED`, `CONTACT_SYNC_COMPLETED`.
- Messaging: `CAMPAIGN_CREATED`, `CAMPAIGN_COMPLETED`, `CAMPAIGN_PARTIAL`, `MESSAGE_DELETE_COMPLETED`.
- Support: `SUPPORT_TICKET_CREATED`, `SUPPORT_ADMIN_REPLIED`, `SUPPORT_STATUS_CHANGED`.
- Administration and recovery: `ADMIN_SETTING_CHANGED`, `FEATURE_FLAG_CHANGED`, `BACKUP_COMPLETED`, `RESTORE_COMPLETED`.
- Log access: `ADMIN_AUDIT_LOG_ACCESSED`, `ADMIN_SECURITY_LOG_ACCESSED`, `ADMIN_SECURITY_EVENT_STATUS_CHANGED`.

## Required fields

Every event has actor type, company, action, result, target type, request/correlation IDs where available, safe client metadata, and timestamp. Important mutations include minimal redacted before/after state and a reason.

## Immutability

`AuditLog` has no update/delete API. The migration installs a PostgreSQL trigger rejecting UPDATE and DELETE. Corrections are new events. Retention automation never deletes `AuditLog`.

## Compatibility rule

New code must use a constant from `AUDIT_ACTIONS`. Existing legacy actions remain readable after canonicalization and should be migrated by domain owners without rewriting historical rows.

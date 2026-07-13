# Logivya Cross-Platform Feature Parity

Logivya must behave as one SaaS product across desktop web, mobile web, Android, and iOS-ready architecture.

The backend is the single source of truth. Frontend clients may present workflows differently for screen size, but they must not own business rules.

## Non-Negotiable Rules

- Every production feature must be registered in `src/config/platform-feature-parity.ts`.
- A feature is complete only when backend behavior, permissions, validation, error handling, and user outcomes are consistent on supported platforms.
- Desktop web, mobile web, Android, and future iOS must use the same backend contract.
- Subscription limits, licensing, quotas, RBAC, tenant isolation, and abuse prevention must be enforced server-side.
- Frontend checks are only UX helpers.
- No new module may ship on only one platform unless it is explicitly marked `platformSpecific`.
- Business logic must not be forked per client. Web, mobile web, Android, and future iOS are presentation layers over backend-owned workflows.
- Every new feature must be designed, reviewed, and tested against desktop web, mobile web, Android, and iOS-ready architecture before release.

## Supported Platforms

- `desktopWeb`
- `mobileWeb`
- `android`
- `ios`

The iOS platform can remain `planned` until the native iOS client exists, but architecture decisions must not block future iOS parity.

## Status Definitions

- `implemented`: user-facing workflow exists and required backend/API files exist.
- `partial`: users can access some workflow coverage, but parity is not complete.
- `planned`: not production-complete; do not market or release as complete parity.
- `platformSpecific`: intentionally limited to a platform with a documented reason.

## Release Gate

Run:

```bash
npm run check:feature-parity
```

The check fails when an `implemented` feature references a missing web, mobile, or backend file.

The check also fails when an `implemented` feature is not implemented on desktop web, mobile web, and Android.

Warnings are expected for `partial` and `planned` features. They are tracked parity gaps, not hidden success, and release notes must not describe them as complete parity.

## Canonical Feature Scope

The following workflows must remain functionally consistent across desktop web, mobile web, Android, and iOS-ready architecture:

- WhatsApp connection
- QR pairing
- Phone code pairing
- Campaign management
- Scheduled messaging
- Recurring messaging
- Group synchronization
- Category management
- Company settings
- Subscription management
- Billing
- User invitations
- Team management
- Notifications
- Support center
- Admin panel for authorized users
- Analytics
- Reports
- Audit logs
- Message history
- Settings
- Profile management

If a workflow is intentionally platform-specific, the registry entry must use `platformSpecific` and document the reason in `notes`.

## Current Known Parity Gaps

The registry currently marks these areas as not fully complete:

- Admin panel: Android has API-backed module coverage, but not every web admin detail workflow has a native-first screen.
- Analytics, reports, and audit logs: Android has summary/detail rows; chart-level parity is still planned.
- Billing lifecycle: mobile can view/request subscription actions, while payment-provider checkout remains backend/web-led.
- Recurring messaging: queue foundation exists, but the full recurrence editor must ship across platforms together.

## Development Workflow

When adding a feature:

1. Add backend API/server behavior first.
2. Add permissions, subscription enforcement, validation, and audit logging on the backend.
3. Reuse the same backend contract from desktop web, mobile web, and Android.
4. Add desktop web, mobile web, and Android presentation.
5. Add iOS-ready registry status.
6. Update `src/config/platform-feature-parity.ts`.
7. Run `npm run check:feature-parity`.
8. Run normal typecheck/lint/build gates.
9. Verify data synchronization across clients: an action on one platform must be visible on the others through polling, push-ready sync, or a documented refresh model.

## Parity Completion Checklist

A feature is not complete until all of these are true:

- Desktop web workflow exists.
- Mobile web workflow exists through responsive web routes.
- Android workflow exists.
- iOS status is planned or implemented without blocking future architecture.
- Backend owns validation, permissions, subscription gates, quotas, and tenant isolation.
- All clients use the same terminology, status labels, error categories, and permission visibility.
- Data created or changed on one platform is visible on other platforms through the documented sync model.
- `npm run check:feature-parity` passes.

## Design Consistency

Every platform must use consistent:

- terminology
- navigation hierarchy
- icon semantics
- color meaning
- permission visibility
- subscription restrictions
- error messages
- empty/loading states

Responsive layout may differ, but workflow meaning must not.

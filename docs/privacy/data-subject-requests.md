# Data Subject Request Procedure

Status: `LEGAL REVIEW REQUIRED`

## Supported request types

Access, rectification, deletion, restriction, objection, portability and other requests are recorded with a public ID, identity-verification status, operational deadline, assignment, thread, event history, export/deletion jobs and legal holds.

## Workflow

1. An authenticated user submits a request and re-enters the current password.
2. The backend resolves user/company from the session or mobile bearer token; client-supplied ownership is ignored.
3. The request begins at `RECEIVED` with an operational target date (default 30 days, not a legal conclusion).
4. A platform admin with `admin.privacy.read` reviews it. Updates require `admin.privacy.update`, recent elevation, a reason and audit record.
5. The admin may request more identity evidence, send a user-visible response, add internal notes or record an approved/rejected/completed outcome.
6. Legal holds prevent completion/closure where applicable.
7. The user can see only requests belonging to the current user and company.

Never request excessive identity documents. Any out-of-band evidence channel, deadline extension, rejection ground and final response template requires counsel approval.

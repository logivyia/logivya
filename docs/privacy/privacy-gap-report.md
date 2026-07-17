# LOGIVYA Privacy Gap Report

Status: `LEGAL REVIEW REQUIRED`

Audit date: 2026-07-16

Scope: Desktop Web, Mobile Web, Android, API, PostgreSQL, Redis queues, Render worker, Vercel, Cloudflare R2 backup storage, email, push notifications, Firebase Analytics, Sentry, support, billing, WhatsApp metadata, groups, contacts, campaigns, message history, logs, audit records, backup and administration.

This report is an engineering and governance assessment. It is not a legal opinion and does not claim KVKK or GDPR compliance.

## Executive findings

| Area | Current classification | Finding | Required treatment |
| --- | --- | --- | --- |
| Tenant authorization | Working and retained | Company, user and WhatsApp ownership checks exist and stable-core tests cover the main cross-tenant paths. | Preserve and include privacy endpoint IDOR tests. |
| Consent records | Working but incomplete | `ConsentRecord` stores type, version and a boolean decision. It lacks purpose code, status history, withdrawal, collection method, platform, locale, app version and evidence metadata. | Migrate additively and keep legacy fields readable. |
| Registration notices | Legally unclear | Terms, privacy notice and KVKK notice are all presented as required acceptance checkboxes and recorded as granted consent. Transparency and consent are not separated. | Preserve the current registration contract until a reviewed notice design is approved; stop treating optional purposes as implied consent. |
| Cookie controls | Misleading/incomplete | The banner stores only `all` or `essential`; granular checkbox state is not persisted and there is no durable withdrawal/settings path. | Add versioned granular preferences and prevent optional SDK/script activation without the relevant choice. |
| Android permissions | Working and retained | Production requests `INTERNET`, `POST_NOTIFICATIONS` and generated `VIBRATE`; it does not request contacts, storage, camera or location. Backup and cleartext traffic are disabled. | Keep minimal and document just-in-time notification permission use. |
| Mobile analytics | Working but incomplete | Firebase Analytics and Sentry SDKs are installed. Sentry redaction and PII-disabled behavior exist, but purpose-specific preference enforcement is incomplete. | Default optional analytics/diagnostics off until preference is known; add user controls and SDK audit. |
| Account deletion | Technically unsafe | Current owner flow immediately disables the company and revokes sessions. It does not create a tracked request, verify recent authentication/2FA, expose cancellation/status, check legal hold or explain retained records. | Replace with a request and deletion-job workflow; do not run destructive production deletion before approval. |
| Company deletion | Missing | Account deletion and company shutdown are currently conflated. | Restrict company deletion to owner, add ownership transfer/member/subscription/financial/legal-hold checks. |
| Data subject requests | Placeholder-only | `DataSubjectRequest` has a small type/status set and no public ID, identity verification, deadline, event timeline, response thread or admin workflow. | Expand additively and implement owner-scoped APIs plus audited admin actions. |
| Data export | Missing | A legacy `exportUrl` field exists but no secure export pipeline exists. | Use private encrypted object storage, one-time authenticated downloads, expiry and cleanup. Never place public URLs in the record. |
| Retention | Working but incomplete | Observability retention supports dry run and enforcement flags. Other data categories do not have a versioned policy or legal-hold-aware job. | Add a policy catalog, retention-run evidence, dry-run default and legal-hold exclusion. |
| Legal hold | Missing | No restricted hold model or review date exists. | Add time-bounded holds with reason, scope, approver, review date and audit evidence. |
| Breach workflow | Working but incomplete | General incident monitoring exists, but there is no restricted personal-data breach register or notification-decision workflow. | Add breach register, jurisdiction-aware review fields and restricted admin endpoints. |
| DPIA | Missing | No release gate for high-risk processing changes exists. | Add DPIA records/templates and a review gate for high-risk providers/features. |
| Legal documents | Placeholder-only | Public pages are short localized content without a database-backed version/review history. | Keep current public text unchanged; create version metadata and draft documents marked `LEGAL REVIEW REQUIRED`. |
| Subprocessors/transfers | Missing as controlled registers | Providers are visible in code/config but there is no approved register or transfer review. | Add version-controlled processor and transfer registers and expose read-only admin views. |
| Backups and deletion | Working but incomplete | Encrypted backup and restore evidence exists. Deletion replay after restore and deletion suppression records are not implemented. | Add documented restore re-deletion procedure and deletion event ledger before enforcing deletion. |
| Administrator access | Working and retained | Backend platform-admin guard, recent elevation, MFA option, rate limits and access audit exist. | Reuse for the Privacy Center; mark breach/legal-hold actions critical. |
| Store disclosures | Missing as versioned artifact | Android permissions and SDKs can be derived, but Google Play/Apple disclosure answers are not kept as a controlled inventory. | Add machine-readable disclosure inventory and review it for each release. |

## Data minimization findings

- Full secrets, WhatsApp session material, tokens, recovery codes and message content are excluded from central logging. Preserve this behavior.
- `ConsentRecord.ipAddress` and `userAgent` currently store raw values. New privacy evidence must use masked IP and summarized user agent; historical records require a separately approved migration/anonymization decision.
- `ApiUsageLog.ipAddress`, `TrustedDevice.ipAddress` and selected authentication records retain full IP values for security purposes. Their precision and retention require a documented legitimate-interest/security assessment.
- `MobileFeedback.screenshot` is a URL string and `deviceInfo` is open JSON. Add allowlisting and retention before accepting uploaded attachments.
- Support attachment URLs exist without a complete private object lifecycle. Public or long-lived support attachment URLs must not be introduced.
- Contact and group data are customer-directed processor data. They must remain tenant/account scoped and must not be copied into analytics, logs, support or administrator views.

## Production infrastructure inventory

| Service | Purpose | Data categories | Current control | Open decision |
| --- | --- | --- | --- | --- |
| Vercel | Web/API hosting and operational logs | Request metadata, user/company identifiers in application traffic | TLS, secret store, privacy-safe logging | Region, DPA, provider log retention and transfer mechanism |
| Render | WhatsApp worker and persistent session cache | WhatsApp account metadata, encrypted session snapshots, queue/job metadata | Restricted worker, persistent disk, encrypted durable snapshots | Region, DPA, disk deletion and incident notice terms |
| PostgreSQL provider | Authoritative application database | All durable account/customer records | TLS, migrations, encrypted backup/restore | Region, PITR retention, DPA and transfer mechanism |
| Redis provider | Queue, locks, rate limits, heartbeat | Pseudonymous IDs and transient job state | TLS, bounded queue payloads | Region, eviction/retention and DPA |
| Cloudflare R2 | Encrypted primary/secondary backups | Encrypted database backup objects | Client-side AES-256-GCM, private buckets | Lifecycle/versioning confirmation and transfer review |
| Email provider | Transactional email | Recipient email, template and delivery metadata | Provider abstraction and delivery log | Active provider, DPA, region, retention and bounce handling |
| Expo push | Mobile notification delivery | Push token and notification payload | Token ownership and revocation | Payload minimization, DPA and transfer review |
| Firebase Analytics | Optional product analytics | App events and device/app metadata | SDK present | Consent/lawful basis, event allowlist, retention and deletion support |
| Sentry | Optional crash diagnostics | Redacted diagnostics, internal user ID | PII disabled and redaction hook | Consent/lawful basis, region, retention and DPA |
| Payment provider | Future/active payment verification | Payment references and billing metadata | Signature verification; no card storage in LOGIVYA | Contract, DPA, retention and final provider scope |

## Release blockers

1. Qualified counsel must approve controller/processor roles, lawful bases, retention periods, transfer mechanisms, breach deadlines and all public legal wording.
2. A dedicated private export bucket and export encryption key must be configured before export processing is enabled in production.
3. Destructive retention/deletion must remain dry-run/queued until a masked staging test, backup, restore and referential-integrity verification pass.
4. Optional analytics and diagnostics must not run before an approved preference/lawful-basis decision.
5. Existing registration wording and legacy consent records require a product/legal migration decision; they must not be silently reclassified as valid optional consent.
6. Provider DPA, region and subprocessor evidence is not present in the repository and must be attached to the legal review register.
7. Google Play Data Safety answers must be reviewed against the generated AAB and current provider configuration before submission.

## Stable-core impact decision

The privacy implementation may read tenant-scoped WhatsApp metadata for an authorized export and may cancel future jobs only inside an approved deletion execution. It must not change Baileys pairing, session restore, account ownership, contact/group synchronization, message queues, worker delivery, message keys, history state or Delete for Everyone behavior.

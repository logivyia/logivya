# Data Classification Standard

Status: `LEGAL REVIEW REQUIRED`

| Class | Examples | Required handling |
| --- | --- | --- |
| PUBLIC | Published product pages, approved public legal notices | Integrity review and controlled publication |
| INTERNAL | Feature configuration, non-sensitive runbooks, aggregate metrics | Authenticated staff access; no public object storage |
| CONFIDENTIAL | Email, phone, contact names, group membership, message history, support content, IP/device activity | Tenant authorization, TLS, private storage, redacted logs, bounded retention and authenticated export |
| HIGHLY_CONFIDENTIAL | Password hashes, refresh tokens, TOTP secrets, recovery codes, WhatsApp session credentials, encryption/provider keys | Field encryption or one-way hash, least privilege, never export/log, key rotation and critical incident severity |
| SPECIAL_CATEGORY_REVIEW | Free-form message/support content that may reveal sensitive traits | Avoid intentional collection; restrict access/export and require DPIA/legal review before new processing |

## Enforcement points

- `src/server/privacy/export.ts` excludes credentials, tokens, session material, internal notes and provider secrets.
- Central logging redaction remains mandatory for CONFIDENTIAL and HIGHLY_CONFIDENTIAL fields.
- `PrivacyBreach.riskLevel` and DPIA residual risk use this classification when assessing severity.
- Backups and privacy exports are private and encrypted; public URLs are prohibited.
- A schema review is required before any new HIGHLY_CONFIDENTIAL or SPECIAL_CATEGORY_REVIEW field is added.

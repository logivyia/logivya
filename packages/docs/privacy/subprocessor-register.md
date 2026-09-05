# Subprocessor Register

Status: `LEGAL REVIEW REQUIRED`

| Provider | Purpose | Data categories | Region/DPA evidence | Approval |
| --- | --- | --- | --- | --- |
| Vercel | Web/API hosting | Request metadata and application traffic | Missing from repository | Pending |
| Render | WhatsApp worker hosting | Tenant WhatsApp metadata and queue state | Missing | Pending |
| PostgreSQL provider | Durable database | Application records | Provider identity/region missing | Pending |
| Redis provider | Queue, locks, rate limits | Pseudonymous IDs and transient state | Provider identity/region missing | Pending |
| Cloudflare R2 | Encrypted backup/export objects | Client-side encrypted archives | Account configured; DPA/region review pending | Pending |
| Email provider | Transactional delivery | Recipient email and minimal template metadata | Active provider confirmation missing | Pending |
| Expo | Push delivery | Push token and minimal payload | DPA/transfer review missing | Pending |
| Firebase Analytics | Optional analytics | Allowlisted app events | Default-off enforcement added; provider terms pending | Pending |
| Sentry | Optional diagnostics | Redacted error diagnostics | PII disabled/default-off; provider terms pending | Pending |
| Payment provider | Payment verification | Payment reference and billing metadata | Final provider/configuration pending | Pending |

No provider is marked approved by this engineering document. Changes require notice/contract/DPIA/transfer review and versioned register history.

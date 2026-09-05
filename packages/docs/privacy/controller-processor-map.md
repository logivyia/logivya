# Controller and Processor Map

Status: `LEGAL REVIEW REQUIRED`

| Activity | Proposed LOGIVYA role | Proposed customer role | Current control | Open decision |
| --- | --- | --- | --- | --- |
| Registration, login, MFA and account security | Controller | Data subject/customer | Tenant-scoped auth, encrypted secrets, audit/security events | Lawful basis and security-event retention |
| Subscription, billing and fraud prevention | Controller | Customer | Company-scoped records and signed provider callbacks | Tax retention and provider role |
| Platform support | Controller for service support; possible processor for customer-provided content | Controller for submitted third-party data | Owner-scoped tickets and admin guard | Attachment lifecycle and notice |
| Customer-directed WhatsApp contacts/groups | Processor candidate | Controller candidate | Company, user and WhatsApp-account ownership filters | DPA instructions and recipient-lawfulness allocation |
| Campaign content, targeting and message history | Processor candidate | Controller candidate | Tenant-scoped queue/history and authorization | Marketing-law responsibility and retention |
| Security monitoring and abuse prevention | Controller candidate | Customer/data subject | Redacted logs, incident and access audit | Legitimate-interest assessment |
| Optional product analytics and diagnostics | Controller candidate | Data subject | Default off; purpose preference controls | Consent/lawful basis and provider configuration |
| Encrypted backup/export storage | Controller or processor follows source data | Customer role follows source data | Private client-side encrypted objects | Provider DPA, region and transfer mechanism |

## Customer responsibilities draft

- Determine a lawful purpose and recipient basis before uploading, categorizing or messaging contacts.
- Provide required recipient notices and honor objections/suppression requirements.
- Avoid special-category or unlawful content unless explicitly supported and approved.
- Keep team access current and report suspected compromise.

These allocations must be reflected in a counsel-approved DPA and customer terms.

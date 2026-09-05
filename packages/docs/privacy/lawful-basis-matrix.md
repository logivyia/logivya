# Lawful-Basis Matrix

Status: `LEGAL REVIEW REQUIRED`

No row below is an approved legal conclusion.

| Purpose | Candidate basis | Necessity/safeguard evidence | Consent used? |
| --- | --- | --- | --- |
| Account and requested service delivery | Contract/performance candidate | Authentication, company membership and requested operations only | Not for mandatory processing |
| Account security, abuse prevention and audit | Legitimate interest/legal obligation candidate | Redaction, least privilege, rate limits, bounded retention and objection assessment | Not automatically |
| Billing, invoices and statutory records | Contract/legal obligation candidate | Provider references only; no card credentials in LOGIVYA | No |
| Customer-directed WhatsApp processing | Customer instruction/contractual processor basis candidate | Tenant/account ownership and DPA instructions | Customer must determine recipient basis |
| Support requested by user | Contract/legitimate interest candidate | User-initiated and access controlled | No unless optional use is introduced |
| Product analytics | Consent or narrowly assessed legitimate interest | Default off, allowlisted events, withdrawal control | `PRODUCT_ANALYTICS` preference |
| Crash diagnostics | Consent or narrowly assessed legitimate interest | Default off, PII-disabled SDK, redaction | `CRASH_DIAGNOSTICS` preference |
| Marketing communication | Consent or jurisdiction-specific exception | Separate, unticked, withdrawable purpose record | `MARKETING_COMMUNICATIONS` |

## Legitimate-interest assessment template

1. Purpose: what specific outcome is pursued?
2. Necessity: why is less intrusive processing insufficient?
3. Balancing: expectations, sensitivity, scale and possible harm.
4. Safeguards: minimization, encryption, access, retention and opt-out.
5. Decision/owner/review date: `LEGAL REVIEW REQUIRED`.

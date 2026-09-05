# Monitoring Data Inventory

| Data | Purpose | Store/provider | Access | Retention/deletion | Privacy basis |
|---|---|---|---|---|---|
| Service state and bounded metrics | Availability/capacity | Generated on request | Platform admin | Snapshot only | Legitimate operational interest |
| Worker heartbeat | Queue consumption evidence | Redis | Backend/admin aggregate | TTL 90 seconds | Legitimate operational interest |
| Operational alerts | Actionable failure record | PostgreSQL | Platform admin/SRE | Alert retention policy; resolved-only cleanup | Security and service reliability |
| Incident records/timeline | Response and review | PostgreSQL | Platform admin/SRE | Operational/legal review | Security and service reliability |
| Admin access/audit | Accountability | PostgreSQL immutable audit | Restricted | Audit policy | Security/compliance |
| Backup workflow metadata | Recoverability | GitHub + current snapshot | Platform admin/SRE | GitHub retention | Business continuity |
| Crash events | Android reliability | Sentry when configured | Restricted provider role | Provider retention configuration | Product reliability |

Prohibited in metrics and alerts: full email, phone, contact names, message contents, ticket bodies, passwords, tokens, session credentials and payment card data. External provider onboarding requires legal/data-processing review, region/retention confirmation and a deletion procedure.

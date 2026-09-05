# Privacy Incident Simulation Plan

Status: `LEGAL REVIEW REQUIRED`

Simulations must use synthetic or masked staging data. They must never notify authorities, customers or data subjects automatically.

| Scenario | Detection proof | Containment proof | Decision workflow | Status |
| --- | --- | --- | --- | --- |
| Cross-tenant contact request | Ownership guard test and audit event | Reject with 403/404 and invalidate suspect session | Breach assessment record | Automated contract test pending full integration environment |
| Public object exposure | Bucket policy/config review | Disable public access, rotate credential, inventory reads | Counsel notification assessment | Manual exercise required |
| Export token leak | One-time token/expiry test | Revoke token, delete object, rotate export key if needed | Affected-scope assessment | Contract tests implemented; staging exercise required |
| Compromised admin session | MFA/elevation/audit review | Revoke sessions and admin elevation | Breach and access review | Security regression required |
| Backup exposure | Restore/backup monitoring alert | Rotate credentials, isolate object, verify encryption | Provider and counsel escalation | Manual exercise required |
| Provider breach notice | Monitoring/support intake | Freeze affected transfer where feasible | Subprocessor and jurisdiction review | Tabletop exercise required |

Each completed exercise must record participants, timestamps, evidence links, gaps, owner and remediation deadline in the breach/DPIA workflow.

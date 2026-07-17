# International Transfer Register

Status: `LEGAL REVIEW REQUIRED`

| Provider | Destination | Data | Proposed safeguard | Evidence required |
| --- | --- | --- | --- | --- |
| Vercel | Provider region confirmation required | Web/API traffic | DPA plus applicable transfer mechanism | Region, subprocessor list and signed terms |
| Render | Provider region confirmation required | Worker/session metadata | DPA plus applicable mechanism | Service region and incident/deletion terms |
| Database/Redis providers | Configuration dependent | Durable/transient application data | Regional hosting, DPA and mechanism | Vendor/account evidence |
| Cloudflare R2 | Account/bucket placement confirmation required | Encrypted archives | Client-side encryption plus DPA/mechanism | Bucket jurisdiction and access/lifecycle evidence |
| Expo/Firebase/Sentry/email/payment | Provider/config dependent | Minimal provider-specific data | Minimization, DPA and applicable mechanism | Contract, region, retention and deletion support |

Technical encryption and tenant isolation do not replace a legally valid transfer mechanism. Counsel must decide adequacy/SCC/other requirements and complete a transfer impact assessment before approval.

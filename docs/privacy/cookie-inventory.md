# Cookie and Browser Storage Inventory

Status: `LEGAL REVIEW REQUIRED`

| Mechanism | Category | Purpose | Activated before optional choice? | Control |
| --- | --- | --- | --- | --- |
| Authentication/session cookie | Strictly necessary | Signed-in session | Yes | HttpOnly/Secure/SameSite server policy |
| CSRF cookie/header evidence | Strictly necessary | Mutation protection | Yes | Same-origin verification |
| Locale preference | Functional | Language selection | Only as requested | User setting |
| Theme preference | Functional | Appearance selection | Only as requested | User setting |
| `logivya_privacy_preferences` | Strictly necessary preference evidence | Versioned functional/analytics/marketing choices | Yes | Granular banner and settings reopen event |
| React Query/browser caches | Strictly necessary/functional | Application state and performance | As needed | Logout and account-change invalidation |
| Optional analytics storage | Analytics | Product measurements | No | Must remain blocked until `PRODUCT_ANALYTICS` grant |
| Optional marketing storage/scripts | Marketing | Campaign attribution | No | No current approved script; block until separate grant |

The banner exposes Accept, Reject and granular Save with equal access. Necessary storage remains on. A “Cookie settings” control reopens choices. Any new third-party script requires inventory, DPIA screening and pre-consent blocking review.

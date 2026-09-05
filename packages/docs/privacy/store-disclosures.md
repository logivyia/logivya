# App Store Disclosure Inventory

Status: `LEGAL REVIEW REQUIRED`

This is evidence preparation, not a completed Google Play Data Safety or Apple App Privacy declaration. Answers must be reconciled against the exact release binary and production provider configuration.

| Data category | Collected/processed | Purpose | Sharing/provider | User control/deletion |
| --- | --- | --- | --- | --- |
| Account identity (name/email/phone) | Yes | Account, security, support | Hosting/database/email providers | Profile/DSR/deletion workflow |
| Company/team data | Yes | SaaS workspace and access | Hosting/database | Owner/admin controls and deletion review |
| WhatsApp phone/contact/group/message metadata | When user connects/uses WhatsApp | Requested messaging service | Render/WhatsApp infrastructure and database | Disconnect, DSR/export/deletion subject to approved retention |
| Telegram account/chat/message metadata | When user connects/uses Telegram | Requested messaging service | Telegram infrastructure, encrypted session storage and database | Disconnect/archive, DSR/export/deletion subject to approved retention |
| Facebook Pages account/post metadata | When user connects/uses Facebook Pages | Requested page publishing service | Meta/Facebook infrastructure and database | Disconnect, post deletion, DSR/export/deletion subject to approved retention |
| Message photos | When selected by the user | Attach to a user-directed message or post | Hosting/storage and the user-selected connected platform | Optional; message/post controls and approved retention |
| Message videos | When selected by the user | Attach to a user-directed message or post | Hosting/storage and the user-selected connected platform | Optional; message/post controls and approved retention |
| Files and documents | When selected by the user | Attach to a user-directed message | Hosting/storage and the user-selected connected platform | Optional; message controls and approved retention |
| Freight marketplace content | When a user creates a listing or demand request | Publish, search and match loads, vehicles and drivers | Hosting/database and authorized marketplace users | Optional; listing lifecycle, DSR/export/deletion |
| Smart-matching source content | When a user explicitly starts matching with connected sources | Find relevant freight opportunities | Hosting/database and authorized connected-platform infrastructure | Optional feature; request and account controls |
| App interactions/analytics | Optional | Product improvement | Firebase when enabled | Off by default; withdraw in Privacy settings |
| Crash and performance diagnostics | Optional | Reliability/security | Sentry and Android Firebase Performance Monitoring when enabled | Off by default; withdraw in Privacy settings |
| Device/push token | When notifications enabled | Notifications/security | Expo/Firebase | Disable notifications/logout/device-session controls |
| Support content/attachments | When submitted | Support | Hosting/email/object provider | Ticket/DSR and approved retention |
| Billing/payment references | When purchasing | Subscription/invoice | Payment provider/database | Statutory/contract retention review |

The verified v196 Android bundle requests notifications at runtime and uses the
Android system photo/document pickers. The product contains no camera-capture
flow, and `CAMERA` is explicitly absent from the release bundle. Network,
wake/boot, biometric storage and launcher-badge permissions support
connectivity, notifications and secure device behavior. The verified v196
bundle contains no device-contact, location, microphone, call-log, SMS, broad
storage/photo, advertising ID or AdServices ID permission.

Google Play Data Safety must add `Photos`, `Videos`, and `Files and docs` as
collected, optional, non-ephemeral data used for app functionality. Transfers
to a connected platform occur only from an explicit user-directed send or
publish action; service-provider and user-initiated transfer exemptions should
be applied consistently with the existing `Other in-app messages` answer.

# App Store Disclosure Inventory

Status: `LEGAL REVIEW REQUIRED`

This is evidence preparation, not a completed Google Play Data Safety or Apple App Privacy declaration. Answers must be reconciled against the exact release binary and production provider configuration.

| Data category | Collected/processed | Purpose | Sharing/provider | User control/deletion |
| --- | --- | --- | --- | --- |
| Account identity (name/email/phone) | Yes | Account, security, support | Hosting/database/email providers | Profile/DSR/deletion workflow |
| Company/team data | Yes | SaaS workspace and access | Hosting/database | Owner/admin controls and deletion review |
| WhatsApp phone/contact/group/message metadata | When user connects/uses WhatsApp | Requested messaging service | Render/WhatsApp infrastructure and database | Disconnect, DSR/export/deletion subject to approved retention |
| App interactions/analytics | Optional | Product improvement | Firebase when enabled | Off by default; withdraw in Privacy settings |
| Crash diagnostics | Optional | Reliability/security | Sentry when enabled | Off by default; withdraw in Privacy settings |
| Device/push token | When notifications enabled | Notifications/security | Expo/Firebase | Disable notifications/logout/device-session controls |
| Support content/attachments | When submitted | Support | Hosting/email/object provider | Ticket/DSR and approved retention |
| Billing/payment references | When purchasing | Subscription/invoice | Payment provider/database | Statutory/contract retention review |

Android permissions are limited to Internet, notifications and generated vibration. No device contacts, location, camera, microphone, call log or SMS permission is requested.

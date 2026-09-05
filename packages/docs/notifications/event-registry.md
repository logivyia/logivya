# Event Registry

The canonical registry is `src/server/notifications/registry.ts`. It currently defines 97 typed events across account, security, support, subscription, billing, invitation, WhatsApp, message results, administration, backup and incident categories.

Every entry declares:

- category and priority
- default and mandatory channels
- required template variables
- audience type

Unknown event names are rejected. Producers must supply an idempotency key tied to the business fact, for example `support-admin-reply:{messageId}:{userId}`. Event and delivery deduplication is enforced by database unique keys.

Adding an event requires a registry entry, localized templates or an intentional safe fallback, channel policy review and contract tests.

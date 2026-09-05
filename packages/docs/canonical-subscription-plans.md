# Canonical subscription plans

`src/config/subscription-plans.ts` is the only source of product pricing, public limits, feature entitlements, branding rules, and billing intervals. Database `Plan` rows persist operational catalog records; APIs normalize them against the canonical configuration before returning them to clients.

## Account terminology

Customer-facing `Hesap` is the purchased allowance. Internally the existing schema retains separate `maxTeamUsers` and `maxWhatsappAccounts` columns to preserve authorization boundaries and migration safety. Both currently receive the plan allowance, but user membership and WhatsApp connection creation continue to be checked independently.

## Legacy compatibility

`free` and `deneme` resolve to Trial; `basic`, `beginning`, and `baslangic` resolve to Starter; `pro` and `profesyonel` resolve to Professional. Historical subscriptions are not rewritten or deleted. Noncanonical plans are removed from new-sale catalogs by marking their plan row inactive, while entitlement resolution continues to understand supported aliases.

Run `npm run audit:canonical-plans` before applying the migration. Companies above a new allowance are reported for review and no member, WhatsApp account, subscription, or paid-through date is deleted.

## Checkout status

The current repository provides verified webhook adapters and a manual upgrade-request flow, but no production provider price identifiers are configured. Provider IDs must remain environment-managed. Monthly and yearly checkout must fail closed until real provider product/price IDs are supplied; placeholder IDs must never be invented or committed.

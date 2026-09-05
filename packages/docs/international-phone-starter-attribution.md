# International Phone Pairing and STARTER Attribution

Status: implemented in code; production worker deployment and real WhatsApp transport evidence remain release gates.

## 1. Codebase Audit

- Monorepo: Next.js 16 web/API at the repository root and Expo/React Native in `apps/mobile`.
- Persistence: PostgreSQL through Prisma. `Company` is the tenant boundary; users access it through company membership. WhatsApp accounts are scoped by company and owner user.
- Authentication: server sessions for web and bearer/mobile sessions for native clients. Pairing routes authenticate and authorize before account lookup or mutation.
- Subscription: company-level subscriptions resolve to canonical plan entitlements. `trial`, `starter`, and `professional` are stable plan codes.
- WhatsApp: QR and phone-code pairing converge on the existing Baileys worker/session lifecycle. This work changes phone input validation and metadata, not socket restore or reconnect behavior.
- Delivery: direct, group, contact, category, scheduled, recurring, resumed, and retry sends converge on `src/worker/index.ts` before the Baileys transport.
- Localization: web JSON catalogs and mobile catalogs share the same ten product locales. Country metadata and attribution text now originate in one versioned registry.
- Observability: structured logger and audit log facilities already exist. New events contain tenant/account identifiers and masked or omitted phone/message data.

## 2. Architecture

`shared/country-registry.json` is the source of truth. Web and backend import it directly. `scripts/generate-country-registry.mjs` validates it and creates a typed mobile artifact, avoiding runtime filesystem access in native builds. CI/build checks compare generated and canonical data.

Phone-code requests send `{ countryIso, nationalNumber }`. Server normalization validates the selected ISO against the registry and parses the national number with `libphonenumber-js`, then supplies canonical E.164 digits to the existing pairing worker. Legacy international `phoneNumber` payloads remain accepted for deployed clients.

At delivery time, `composeOutboundMessage` validates tenant/account ownership, resolves the effective subscription, resolves the sender account locale, and renders a stable final payload. The rendered payload and attribution metadata are persisted per recipient before transport. Retries reuse that payload, so a transient retry cannot duplicate or change the footer.

## 3. Root Causes

1. Country options were represented independently in clients and did not cover every supported product locale.
2. Phone input could reach pairing as loosely normalized digits, making country mismatch and duplicate-prefix handling inconsistent.
3. Branding behavior was represented as client-visible entitlement/UI logic rather than one mandatory transport-time composition rule.
4. Scheduled plan changes could only be correct if the effective plan was re-evaluated at actual delivery.
5. Retry auditability required a distinction between original campaign content and the exact rendered recipient payload.

## 4. Country Matrix

| Locale | Country | ISO | Calling code | Attribution translation |
|---|---|---:|---:|---|
| tr | Türkiye | TR | +90 | Bu mesaj logivya.com üzerinden gönderilmiştir. |
| en | United Kingdom | GB | +44 | This message was sent via logivya.com. |
| ro | România | RO | +40 | Acest mesaj a fost trimis prin logivya.com. |
| ru | Россия | RU | +7 | Это сообщение отправлено через logivya.com. |
| az | Azərbaycan | AZ | +994 | Bu mesaj logivya.com vasitəsilə göndərilib. |
| tk | Türkmenistan | TM | +993 | Bu habar logivya.com arkaly ugradyldy. |
| de | Deutschland | DE | +49 | Diese Nachricht wurde über logivya.com gesendet. |
| bg | България | BG | +359 | Това съобщение е изпратено чрез logivya.com. |
| el | Ελλάδα | GR | +30 | Αυτό το μήνυμα στάλθηκε μέσω του logivya.com. |
| sr | Srbija | RS | +381 | Ova poruka je poslata putem logivya.com. |

The schema supports adding more countries without changing client contracts. Locale lookup selects a primary country today; country ISO remains the authoritative pairing choice.

## 5. Plan Behavior Matrix

| Effective plan | Attribution |
|---|---|
| TRIAL | Required |
| STARTER | Required |
| PROFESSIONAL | Disabled |
| Higher eligible plan | Disabled |
| Inactive/locked | Message delivery rejected |

The subscription is resolved at actual delivery. An upgrade before a scheduled send removes attribution; a downgrade before delivery adds it. A retry reuses the first persisted rendered payload for idempotency.

## 6. Normalization and Validation

- Only enabled registry countries are accepted.
- National input rejects letters, unsupported symbols, arbitrary Unicode, explicit `+` prefixes, and a repeated selected calling code.
- `libphonenumber-js` validates possibility, validity, and parsed country, then returns E.164.
- Phone logs are masked; message bodies and session credentials are never logged.
- Structured errors: `INVALID_WHATSAPP_PHONE`, `PHONE_COUNTRY_MISMATCH`, `UNSUPPORTED_PHONE_COUNTRY`, and `DUPLICATE_PHONE_COUNTRY_CODE`.
- QR pairing remains backward compatible and does not require country metadata.

## 7. Locale Resolution

Attribution locale is resolved server-side in this order:

1. User locale preference
2. Company default language
3. Legacy WhatsApp account `messageLocale`
4. Account `countryIso`
5. Country inferred unambiguously from canonical phone
6. English

Recipient locale and client-provided footer text are never used. A safe structured warning records English fallback without logging message content.

## 8. Rendering and Limits

- Unicode is normalized to NFC.
- Exactly one blank line separates content and footer.
- User-authored content is immutable and is never stripped through sentence matching.
- Only records explicitly identified as legacy combined payloads may have a known suffix normalized.
- Retry idempotency uses persisted structured rendering metadata and reuses the exact prior payload.
- The final text limit is 4096 code units. Content is never silently truncated.
- Web and mobile show a conservative STARTER-aware input limit; server validation remains authoritative.
- Text captions can use the same composer through `CAPTION`; binary-only payloads receive no unsolicited second message.

## 9. Data Migration

Migration: `prisma/migrations/20260720170000_international_pairing_starter_attribution/migration.sql`.

It adds nullable WhatsApp country/locale/connection metadata and nullable recipient rendering/audit metadata. Existing digit-only international phones are prefixed with `+`. Unambiguous supported prefixes are backfilled. `+7` is deliberately not assigned to Russia in SQL because it is shared with Kazakhstan; unresolved existing accounts retain null country metadata and use company/user/English fallback until reconnect or explicit enrichment.

The migration is additive and uses `ADD COLUMN IF NOT EXISTS`. Rollback is operationally safe by first deploying code that ignores the new fields, then optionally dropping the added columns after retention/export review. Production migration execution is a separate approved operation.

## 10. Security and Consistency Controls

- Web pairing enforces same-origin, session, role permission, tenant/user ownership, rate limits, and worker health.
- Mobile pairing authenticates before parsing payloads and scopes account reuse to company/user.
- The worker re-resolves ownership and effective plan before every first rendering; clients cannot send `disableBranding` or arbitrary locale/footer values.
- Recipient rendering is persisted before transport and reused on retries.
- Subscription lookup is uncached in this path, so effective plan changes are visible immediately. Existing client query invalidation still refreshes UI entitlement notices.
- Structured events record applied/skipped/reused/duplicate-prevented/fallback/length-exceeded outcomes without raw message text.

## 11. Files Added or Changed for This Feature

- Registry/generation: `shared/country-registry.json`, `scripts/generate-country-registry.mjs`, `apps/mobile/src/generated/country-registry.ts`.
- Phone libraries/UI/API: `src/lib/international/country-registry.ts`, `src/lib/phone/normalize.ts`, `apps/mobile/src/features/whatsapp/phone.ts`, both pairing screens, and three pairing API routes.
- Entitlements/composition: `src/server/billing/plan-matrix.ts`, `company-entitlements.ts`, `effective-messaging-plan.ts`, `src/server/messages/outbound-composer.ts`, worker and message-history response paths.
- Schema/migration: `prisma/schema.prisma` and the migration listed above.
- Localization/tests: ten web catalogs, ten mobile catalogs, and focused test scripts.

## 12. Automated Tests

- Registry parity, schema validity, deterministic order, unique ISO codes, every supported country, E.164 normalization, malformed/unsupported/duplicate-prefix rejection.
- Web/mobile route use of canonical validation, structured codes, authentication ordering, and metadata persistence.
- Exact ten-locale attribution, English fallback, Unicode/emoji/NFC, newline variants, duplicate prevention, message-length boundary.
- Trial/STARTER/PROFESSIONAL/enterprise/inactive entitlement behavior and upgrade/downgrade contracts.
- Worker source contracts ensure group/contact delivery uses the canonical rendered payload and retry rendering.

## 13. Manual QA Checklist

- Web desktop/mobile, light/dark: open country selector, keyboard navigation, search/scroll, long/Cyrillic/Greek labels, dynamic placeholder.
- Android/iOS: safe-area modal, keyboard open, small screen, select all ten countries, invalid/duplicate prefix errors.
- Pair one account by QR to prove unchanged flow; pair each representative country by phone code and confirm E.164/masked display.
- STARTER: direct, group, category, bulk, scheduled, recurring, API and retry sends show exactly one localized footer.
- Upgrade to PROFESSIONAL before execution and verify no footer; downgrade before execution and verify it returns.
- Verify history shows actual rendered content and another tenant cannot access account, group, contact, or recipient rendering.

## 14. Rollback

1. Stop deployment if focused pairing, stable-core, or delivery tests fail.
2. Roll back application/worker together to the prior release; nullable columns remain harmless.
3. Do not roll back by deleting WhatsApp sessions or recipient history.
4. If registry data is faulty, restore the prior registry version, regenerate mobile data, and deploy both clients/backend together.
5. Drop new database columns only in a later reviewed migration after confirming no required audit data remains.

## 15. Release Decision Rules

GO requires typecheck, lint, production web build, Prisma generation/validation, translation integrity, secret scan, stable-core regressions, Android/iOS configuration checks, and signed build verification. Real-device QR/phone pairing and message transport remain manual external checks and must not be claimed from compilation alone.

NO-GO applies if any critical automated check fails, migration safety cannot be established for the target database, the production worker is not deployed with the web/API code, or real-device pairing/message tests fail.

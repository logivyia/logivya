# Logivya Next Implementation Plan

Date: 2026-06-15
Purpose: Prioritized plan after the current status audit.

## P0 - Must Fix Before Any More Feature Work

### 1. Fix production build boundary

Problem:

- Root `npm run build` fails because root TypeScript includes `apps/mobile`.
- Mobile uses its own `@/*` alias, but root alias resolves `@/*` to `src/*`.

Required outcome:

- Root web build ignores mobile Expo source.
- Mobile app still typechecks through `apps/mobile`.

Validation:

```bash
npm run build
cd apps/mobile
npm run typecheck
```

### 2. Confirm Git remote

Current remote:

```text
https://github.com/logivyia/logivya.git
```

Required decision:

- Confirm whether `logivyia/logivya.git` is the real production repository.
- If not, switch to the correct remote before push/deploy.

### 3. Fix mobile register contract

Problem:

- Mobile sends `fullName`, `acceptTerms`, `acceptPrivacy`, `acceptKvkk`.
- Backend expects `name`, `passwordConfirmation`, `termsAccepted`, `privacyAccepted`, `kvkkAccepted`.

Required outcome:

- Mobile registration creates a real account through `/api/mobile/auth/register`.

### 4. Fix email env documentation

Problem:

- Runtime Resend provider expects `RESEND_API_KEY` and `EMAIL_FROM`.
- `.env.example` currently lists `EMAIL_FROM_NAME` and `EMAIL_FROM_ADDRESS`.

Required outcome:

- `.env.example` clearly documents:
  - `RESEND_API_KEY`
  - `EMAIL_FROM=Logivya <noreply@logivya.com>`

## P1 - Production Reliability

### 5. Verify production migrations

Required:

- Confirm production database has all migrations including mobile backend tables.
- Verify:
  - `MobileDeviceSession`
  - `MobilePushToken`
  - password reset fields
  - admin security tables
  - subscription/billing tables

### 6. Verify WhatsApp worker production runtime

Required:

- Worker runs continuously.
- Redis is reachable.
- Sessions are durable.
- `WHATSAPP_WORKER_URL` is set.
- QR generation works.
- Phone pairing works.
- Group sync works.

### 7. Verify scheduled message delivery

Required:

- Schedule a campaign.
- Confirm BullMQ delayed job exists.
- Confirm worker sends at scheduled time.
- Confirm delivery result updates history.

## P2 - Mobile Phase Completion

### 8. Add missing mobile APIs

Required endpoints:

- notification list
- mark notification read
- mark all notifications read
- profile update
- change password
- company settings update
- optional support ticket close

### 9. Complete mobile screens against real APIs

Required screens:

- notification center
- profile edit
- change password
- company settings edit
- full message history
- send message
- scheduled message

### 10. Add mobile release tooling

Required:

- mobile lint script
- test script
- EAS build config
- app icon and splash validation
- Android package id
- iOS bundle id

## P3 - Hardening And Scale

### 11. Add end-to-end tests

Flows:

- web login/register/password reset
- mobile login/register/password reset
- WhatsApp QR pairing
- WhatsApp phone pairing
- send now
- scheduled send
- subscription activation
- admin approval

### 12. Add observability

Required:

- worker health dashboard
- queue depth metrics
- failed job alerts
- WhatsApp connection state alerts
- email provider health check

## Recommended Next Prompt

```text
Continue the existing Logivya codebase.

Fix only the production build and mobile API contract blockers found in docs/PROJECT_CURRENT_STATUS_AUDIT.md and docs/NEXT_IMPLEMENTATION_PLAN.md.

Do not implement new product features.
Do not delete source code.

Tasks:
1. Fix root web build so apps/mobile is excluded from the root Next.js TypeScript/build pipeline.
2. Keep apps/mobile typecheck working.
3. Fix mobile register request mapping to match /api/mobile/auth/register.
4. Update email environment documentation for Resend:
   RESEND_API_KEY
   EMAIL_FROM=Logivya <noreply@logivya.com>
5. Run:
   npm run db:generate
   npm run lint
   npm run build
   cd apps/mobile && npm run typecheck
6. Report every file changed and every command result.

Implement directly.
Do not only explain.
```


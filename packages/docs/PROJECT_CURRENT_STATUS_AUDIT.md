# Logivya Current Status Audit

Date: 2026-06-15
Scope: Web platform, mobile app foundation, mobile backend APIs, auth, Prisma, WhatsApp, billing, admin, localization, security, deployment, and testing.
Rule followed: Audit only. No product feature code was changed.

## Executive Summary

Logivya is a real production SaaS codebase with a substantial Next.js web platform, Prisma/PostgreSQL data model, WhatsApp worker architecture, subscription and admin foundations, and a newly started Expo mobile app. The main issue is not lack of code. The main issue is that several important changes are not safely deployable yet because the root production build is currently failing.

Current readiness estimate:

| Area | Readiness | Status |
| --- | ---: | --- |
| Overall platform | 68% | Partial |
| Web application | 72% | Partial, broad feature coverage but deploy is blocked |
| Mobile application | 62% | Foundation plus several screens exist, but some API contracts are broken or missing |
| Backend APIs | 74% | Strong foundation, incomplete mobile profile/notification/company endpoints |
| Security | 70% | Good session/token/audit foundations, needs production hardening verification |
| Deployment health | 45% | Build currently fails; production can remain stale |

Critical conclusion:

1. The local landing page no longer contains the old "WhatsApp gruplarina toplu mesaj" hero text, but production can still show it because `npm run build` currently fails.
2. The repository remote is `https://github.com/logivyia/logivya.git`, while the expected brand/repo mentioned earlier was `logivya/logivya`. This must be confirmed before future pushes.
3. Mobile registration is currently broken by a request/response contract mismatch between `apps/mobile` and `/api/mobile/auth/register`.
4. WhatsApp, scheduled messages, and QR/phone pairing depend on worker, Redis, and durable session configuration. Vercel serverless alone is not enough for reliable WhatsApp runtime behavior.
5. The mobile app has a good foundation but Phase 7 is only partially complete because notification list, profile update, company settings update, and password change APIs are missing.

## Git And Repository State

Commands checked:

```bash
git status --short --branch
git branch -vv
git log --oneline -10
git remote -v
```

Results:

Current branch:

```text
main...origin/main
```

Tracking:

```text
main 6308c24 [origin/main] Add Logivya mobile app foundation
```

Remote:

```text
origin https://github.com/logivyia/logivya.git
```

Recent commits:

```text
6308c24 Add Logivya mobile app foundation
8055170 Add mobile backend foundation
0d0d73e Update Logivya landing branding
72f1400 Fix production password reset email delivery
67f2dac Simplify registration form
eec7586 Fix client locale synchronization
aad5893 Localize admin UI and password reset email delivery
ce79c10 Stabilize WhatsApp connection and support flows
bb673b5 Fix subscription banner status display
ee91e0a Fix password reset SMTP delivery
```

Uncommitted mobile changes exist. They include modified mobile API/client/auth/navigation/screen files and many untracked mobile Phase 4/5/7 files. This means the repository is not clean.

Important risk:

- Remote uses `logivyia`, not `logivya`.
- If this is the wrong GitHub organization, pushes and Vercel deployments can target the wrong source.

## Project Structure

Root application:

- Next.js web app in `src/app`
- Prisma schema and migrations in `prisma`
- Worker code in `src/worker`
- Public assets in `public`
- Mobile app in `apps/mobile`

Mobile app:

```text
apps/mobile
  app
  assets
  src
    api
    auth
    components
    constants
    features
    hooks
    i18n
    navigation
    screens
    storage
    theme
    types
    utils
```

The monorepo boundary is not clean yet. Root `tsconfig.json` includes all `**/*.ts` and `**/*.tsx`, so the root Next.js build type-checks Expo files under `apps/mobile`. This is the immediate build blocker.

## Build And Validation Results

Commands run:

```bash
npm.cmd run db:generate
npm.cmd run lint
npm.cmd run build
npm.cmd run typecheck
npx.cmd expo config --type public
npx.cmd prisma migrate status
```

Results:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run db:generate` | PASS | Prisma Client v7.8.0 generated |
| `npm run lint` | PASS | Root lint passed |
| `npm run build` | FAIL | Root Next build imports mobile Expo app files |
| `apps/mobile npm run typecheck` | PASS | Mobile TypeScript passes in its own project |
| `apps/mobile npx expo config --type public` | PASS | Expo config resolves |
| `npx prisma migrate status` | FAIL | Local DB/schema engine check failed against `localhost:5432` |

Root build error:

```text
./apps/mobile/App.tsx:7:31
Type error: Cannot find module '@/navigation/root-navigator'
```

Root cause:

- Root `tsconfig.json` includes `apps/mobile`.
- Root path alias `@/*` points to `./src/*`.
- Mobile also uses `@/*`, but inside mobile it means `apps/mobile/src/*`.
- Next build resolves mobile imports using the root alias, so it fails.

Required fix:

- Exclude `apps/mobile` from root Next/TypeScript build, or move to a proper workspace config with separate TS project boundaries.
- This should be the first implementation task before expecting production updates.

## Web Platform Audit

| Module | Status | Notes |
| --- | --- | --- |
| Landing page | Partial | Local code uses Logivya brand hero, but production may be stale because build fails |
| Login | Complete | Real login exists |
| Register | Complete for web | Registration exists and simplified |
| Forgot password | Partial | Resend/SMTP implementation exists, but production env and real send must be verified |
| Reset password | Partial | Flow exists; real email delivery depends on env |
| Dashboard | Partial | Subscription banner logic exists; needs live data verification |
| Accounts / WhatsApp | Partial | QR and phone flows exist but depend on worker health and durable sessions |
| Groups | Partial | Web groups exist and sync data is shown |
| Categories | Partial | Category management exists |
| Send message | Partial | Direct send exists but depends on connected account/worker/queue |
| Scheduled messages | Broken risk | User reported future messages fail; worker/Redis/delayed jobs must be verified |
| Message history | Partial | History exists |
| Support | Partial | Support pages and APIs exist |
| Settings | Partial | Company, user, subscription pages exist |
| Billing | Partial | Billing profile and invoice models exist, but official invoice provider is not integrated |
| Super Admin | Partial | Many admin pages exist; some features are view/control foundations |
| Notifications | Partial | Web notifications exist, mobile list API is missing |
| Localization | Partial | Provider exists, but there are stale deploy and encoding risks |
| Branding | Partial | Local branding improved, production still can show stale assets |

## Mobile Application Audit

Mobile framework:

- Expo SDK 54
- React Native 0.81.5
- React 19.1.0
- TypeScript
- Zustand
- React Navigation
- Expo Secure Store

Mobile app status:

| Screen | Status | Notes |
| --- | --- | --- |
| Splash | Complete foundation | Uses bootstrap/auth restore concept |
| Login | Complete foundation | Uses mobile login API |
| Register | Broken | Field names do not match backend mobile register API |
| Forgot Password | Partial | Calls mobile forgot password API |
| Reset Password | Partial | Calls reset API, needs real email validation |
| Dashboard | Partial | Basic display/foundation |
| WhatsApp Accounts | Partial | Account list and flows exist |
| WhatsApp QR | Partial | UI exists; live worker required |
| WhatsApp Phone Code | Partial | UI and Turkish phone normalization exist |
| Groups | Partial | List/search/filter UI exists |
| Categories | Partial | CRUD and assignment UI exist |
| Messaging | Placeholder | Business logic intentionally not implemented yet |
| Message History | Missing/Partial | No full dedicated mobile history screen confirmed |
| Support | Partial | List/create/detail/reply exists |
| Notifications | Placeholder/Broken | Only push token registration API exists |
| Profile | Partial | Display/logout exists, update APIs missing |
| Company Settings | Partial | Display/edit UI exists, backend update API missing |
| Subscription | Partial | Display-only status screen exists |
| Settings | Partial | Language/theme/logout foundation |

Mobile package scripts:

```text
start
android
ios
web
typecheck
```

Missing mobile quality scripts:

- `lint`
- `test`
- EAS build scripts
- production release profile

## Mobile Backend API Audit

Existing mobile API files: 28.

Existing usable APIs:

| API | Status | Notes |
| --- | --- | --- |
| `POST /api/mobile/auth/login` | Complete | Token login, mobile session creation |
| `POST /api/mobile/auth/register` | Backend complete, mobile client mismatch | Backend expects `name`, `passwordConfirmation`, consent fields |
| `POST /api/mobile/auth/refresh` | Complete | Refresh token rotation |
| `POST /api/mobile/auth/logout` | Complete | Revokes mobile session |
| `GET /api/mobile/auth/me` | Complete | Current user |
| `POST /api/mobile/auth/forgot-password` | Partial | Depends on email provider env |
| `POST /api/mobile/auth/verify-reset-code` | Partial | Exists |
| `POST /api/mobile/auth/reset-password` | Partial | Exists |
| `GET /api/mobile/bootstrap` | Complete | User, company, subscription, summary |
| `GET /api/mobile/subscription/status` | Complete | Display-only status |
| `GET /api/mobile/whatsapp/accounts` | Complete | Account list |
| `POST /api/mobile/whatsapp/accounts/qr` | Partial | Requires live worker |
| `POST /api/mobile/whatsapp/accounts/phone-code` | Partial | Requires live worker |
| `GET /api/mobile/whatsapp/accounts/:id/status` | Partial | Polling endpoint |
| `POST /api/mobile/whatsapp/accounts/:id/reconnect` | Partial | Requires worker |
| `POST /api/mobile/whatsapp/accounts/:id/archive` | Complete foundation | Tenant checked |
| `DELETE /api/mobile/whatsapp/accounts/:id` | Complete foundation | Tenant checked |
| `GET /api/mobile/groups` | Partial | `q` search exists, server filters limited |
| `GET /api/mobile/categories` | Complete foundation | List |
| `POST /api/mobile/categories` | Complete foundation | Create |
| `PATCH /api/mobile/categories/:id` | Complete foundation | Update and group assignment |
| `DELETE /api/mobile/categories/:id` | Complete foundation | Archive/delete style |
| `POST /api/mobile/messages/send` | Partial | Requires connected account, worker, queues |
| `POST /api/mobile/messages/schedule` | Partial | Requires Redis/BullMQ worker |
| `GET /api/mobile/messages/history` | Partial | Exists |
| `GET /api/mobile/messages/history/:id` | Partial | Exists |
| `GET /api/mobile/support/tickets` | Complete foundation | List |
| `POST /api/mobile/support/tickets` | Complete foundation | Create, priority hardcoded |
| `GET /api/mobile/support/tickets/:id` | Complete foundation | Detail |
| `POST /api/mobile/support/tickets/:id/messages` | Complete foundation | Reply |
| `POST /api/mobile/notifications/register-token` | Complete foundation | Push token registration only |

Missing mobile APIs:

| Missing API | Priority | Why |
| --- | --- | --- |
| Notification list | P1 | Mobile Notification Center cannot load real notifications |
| Mark notification as read | P1 | Required by Phase 7 |
| Mark all notifications as read | P1 | Required by Phase 7 |
| Profile update | P1 | Mobile profile edit cannot persist |
| Change password | P1 | Mobile security settings cannot persist |
| Company settings get/update normalized API | P1 | Mobile company settings cannot persist reliably |
| Support ticket close | P2 | Optional if backend supports it |
| Group server-side account/category filters | P2 | Mobile filters currently likely client-side |
| Message history dedicated filters | P2 | Mobile full history screen needs richer API |
| Mobile push notification delivery | P2 | Token register exists, delivery not confirmed |

## Critical Mobile Contract Mismatch

Mobile client sends:

```ts
{
  fullName,
  email,
  phone,
  companyName,
  password,
  acceptTerms,
  acceptPrivacy,
  acceptKvkk
}
```

Backend expects:

```ts
{
  name,
  email,
  phone,
  password,
  passwordConfirmation,
  termsAccepted,
  privacyAccepted,
  kvkkAccepted
}
```

Impact:

- Mobile registration will fail validation.
- This is a P0 mobile blocker.

## Authentication And Session Audit

Web auth:

- Session/cookie-based auth exists.
- User sessions and login attempts exist.
- Password hashing exists.
- Audit logging exists.

Mobile auth:

- Access token and refresh token architecture exists.
- Tokens are stored through Expo Secure Store.
- Refresh token rotation exists.
- Mobile sessions are persisted in `MobileDeviceSession`.
- Logout revokes the mobile session.
- Invalid/expired refresh token paths create security events.

Mobile auth gaps:

- Register request contract mismatch.
- Device binding is only foundation-level.
- Biometric-ready architecture is not yet implemented in UI.
- No mobile MFA flow.
- Need production verification for refresh rotation and revoke behavior.

## Prisma And Data Model Audit

Major models exist:

- User
- Company
- CompanyUser
- Plan
- Subscription
- WhatsAppAccount
- WhatsAppSession
- WhatsAppGroup
- Category
- CategoryGroup
- MessageCampaign
- MessageRecipient
- Notification
- AuditLog
- CompanyBillingProfile
- Invoice
- Payment
- PasswordResetToken
- MobileDeviceSession
- MobilePushToken
- SupportTicket
- SupportTicketMessage
- SecurityEvent
- PlatformAdmin
- AdminPermission

Mobile backend migration exists:

```text
20260615073000_mobile_backend_foundation
```

Migration status could not be verified locally because Prisma could not connect/check schema engine against the configured local database.

Risk:

- Production migrations must be verified against the actual production database before relying on mobile sessions and push tokens.

## WhatsApp System Audit

Implemented foundations:

- Baileys provider integration exists.
- QR connection endpoint exists.
- Phone-code pairing endpoint exists.
- Phone normalization exists.
- Worker queue jobs exist.
- Account status transitions exist.
- Group sync logic exists.
- Archive/reconnect/delete endpoints exist.

Production dependencies:

- `REDIS_URL`
- `WHATSAPP_WORKER_URL`
- `WHATSAPP_SESSION_SECRET`
- durable `WHATSAPP_SESSION_DIR`
- worker process running continuously
- BullMQ workers running continuously

Critical risk:

- Vercel serverless is not a persistent worker runtime.
- WhatsApp session storage must be durable.
- Scheduled messages need a running worker when delivery time arrives.

User-reported symptoms match this risk:

- QR sometimes not visible
- account connected but sending says not connected
- future messages show queued but fail when time arrives

## Password Reset And Email Audit

Implemented:

- Password reset token model exists.
- Six-digit code generation exists.
- Code is hashed before storage.
- Expiry and attempt limits exist.
- Resend/SMTP provider abstraction exists.
- Email templates exist.
- Audit logs exist.

Provider behavior:

- If `RESEND_API_KEY` exists, code expects `EMAIL_FROM`.
- If SMTP is used, code expects `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`.

Config issue:

- `.env.example` includes `EMAIL_FROM_NAME` and `EMAIL_FROM_ADDRESS`, but Resend code expects `EMAIL_FROM`.
- This can confuse production setup.

Production risk:

- Resend API key and sender domain must be valid in Vercel.
- A successful local provider config does not prove production delivery.

## Subscription And Billing Audit

Implemented:

- Plans exist.
- Trial subscriptions exist.
- Subscription model supports trialing, active, cancelled, expired, suspended style flows.
- Billing profile model exists.
- Invoice model exists.
- Payment model exists.
- Admin manual subscription management appears present.
- Dashboard subscription display logic has been worked on.

Gaps:

- Official payment gateway flow is not complete.
- Official e-invoice provider integration is not implemented.
- Mobile subscription is display-only.
- Subscription enforcement must be retested after worker and mobile contract fixes.

## Super Admin Audit

Implemented:

- Admin shell exists.
- Admin route layout calls `requirePlatformAdmin`.
- Many admin sections exist:
  - dashboard
  - companies
  - users
  - billing
  - subscriptions
  - invoices
  - payments
  - WhatsApp accounts
  - campaigns
  - support
  - security
  - compliance
  - audit center
  - activity center
  - notifications
  - data requests
  - metrics
  - system health
  - backups
  - disaster recovery
  - platform settings

Recently fixed locally:

- Admin sidebar uses `router.replace` for internal navigation.
- Admin exit button returns to `/dashboard`.

Risks:

- Admin localization still appears stale or untranslated in production screenshots.
- Admin features need route-by-route permission verification.
- Build failure blocks deploy.

## Localization Audit

Implemented:

- i18n provider exists.
- Locales are loaded through `/api/locales`.
- Locale persistence exists in localStorage and cookie.
- RTL support exists for Arabic.

Issues:

- Production screenshots still show English admin sidebar while Turkish is selected.
- Some source output appears mojibake in terminal, which may indicate encoding or display issues.
- Mobile screens contain hardcoded Turkish text and mojibake strings.
- Mobile i18n only partially covers screens.

Status:

- Web i18n: Partial.
- Admin i18n: Partial.
- Mobile i18n: Partial.

## Branding And UI Audit

Implemented locally:

- `BrandLogo` points to Logivya assets.
- Root layout metadata uses Logivya title/applicationName.
- Manifest uses Logivya.
- Landing page local code now shows `BrandLogo` and the Logivya slogan.

Remaining risks:

- Production still shows stale hero if build/deploy has not succeeded.
- Root directory still contains older image files like `favcoin.jpeg`, `logivya.jpeg`, and `logo.jpeg`.
- Some browser/PWA cache issues may remain.

## Security Audit

Strengths:

- Password hashing exists.
- Password reset codes are hashed.
- Mobile refresh tokens are hashed.
- Mobile sessions are database-backed.
- Audit logs exist in many flows.
- Tenant checks are used in mobile APIs.
- Permissions are defined for workspace roles.
- Platform admin guard exists.

Risks:

- Production secrets and env variables cannot be verified from local audit.
- Redis and worker exposure/security needs production review.
- Admin API permission checks should be audited route-by-route.
- Mobile token lifetime and refresh token reuse detection should be tested in production-like conditions.
- Rate limiting is in-app/local and should be verified under serverless/runtime constraints.
- No automated end-to-end security test suite confirmed.

## Deployment And Vercel Audit

`vercel.json`:

```json
{
  "framework": "nextjs",
  "installCommand": "npm install",
  "buildCommand": "npm run build"
}
```

Deployment blockers:

1. `npm run build` fails.
2. Root TypeScript includes mobile app.
3. Current Git remote may be wrong.
4. Production env variables are not verified.
5. Worker runtime is external to Vercel serverless.

This explains why browser screenshots can still show old landing text even when local code has changed.

## Completion Matrix

| Area | Complete | Partial | Missing | Broken |
| --- | ---: | ---: | ---: | ---: |
| Web auth | yes |  |  |  |
| Web password reset |  | yes |  |  |
| Web dashboard |  | yes |  |  |
| Web WhatsApp connection |  | yes |  |  |
| Web messaging |  | yes |  |  |
| Web scheduled messaging |  | yes |  | risk |
| Web admin |  | yes |  |  |
| Web localization |  | yes |  |  |
| Web branding |  | yes |  | production stale |
| Mobile app foundation | yes |  |  |  |
| Mobile auth |  | yes |  | register contract |
| Mobile WhatsApp |  | yes |  | worker-dependent |
| Mobile groups/categories |  | yes |  |  |
| Mobile messaging |  | placeholder | business UI |  |
| Mobile support |  | yes | close API |  |
| Mobile notifications |  | placeholder | list/read APIs |  |
| Mobile profile/settings |  | yes | update/change-password APIs |  |
| Mobile subscription |  | yes | payment flow |  |
| Prisma schema | yes |  |  | migration verification |
| Production deploy |  |  |  | build fails |

## Top 10 Blockers

1. Root `npm run build` fails because `apps/mobile` is included in root Next TypeScript build.
2. Git remote is `logivyia/logivya.git`; confirm whether this is the real production repo.
3. Mobile register client payload does not match backend mobile register schema.
4. Production landing/branding changes cannot be trusted until build and deploy pass.
5. WhatsApp worker and durable session runtime must be verified outside Vercel serverless.
6. Scheduled messages require Redis/BullMQ worker verification.
7. Mobile notifications list/read APIs are missing.
8. Mobile profile update/change password/company settings APIs are missing.
9. Resend env docs are inconsistent with runtime expectation (`EMAIL_FROM`).
10. Production database migration status could not be verified from this environment.

## Top 10 Next Tasks

1. Fix root/mobile TypeScript project boundaries so root build passes.
2. Confirm and correct Git remote before any future push.
3. Fix mobile register payload mapping.
4. Run `npm run build` until it passes.
5. Deploy the passing build to the confirmed Vercel project.
6. Verify production env variables for Resend, Redis, WhatsApp worker, auth secrets, and database.
7. Verify production migrations are applied.
8. Create missing mobile notification/profile/company/password APIs.
9. Verify WhatsApp QR, phone pairing, send-now, and scheduled delivery end-to-end with live worker.
10. Add mobile lint/test/EAS build configuration.

## Exact Next Codex Prompt

Use this as the next implementation prompt:

```text
Continue the existing Logivya codebase.

Fix only the production build and mobile API contract blockers found in docs/PROJECT_CURRENT_STATUS_AUDIT.md.

Do not implement new product features.

Tasks:
1. Fix root Next.js build so apps/mobile is not type-checked by the root web build.
2. Keep apps/mobile typecheck working independently.
3. Fix mobile register client payload to match /api/mobile/auth/register schema.
4. Update .env.example so Resend uses EMAIL_FROM consistently.
5. Run:
   - npm run lint
   - npm run db:generate
   - npm run build
   - cd apps/mobile && npm run typecheck
6. Do not delete existing source code.
7. Do not modify web UI behavior except what is required for build config.
8. Report files changed, commands run, and final build status.

Implement directly.
Do not only explain.
```


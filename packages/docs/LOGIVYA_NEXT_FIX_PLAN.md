# Logivya Next Fix Plan

Audit date: 2026-06-16

This plan lists the next work that should be done before any new product feature is added.

## P0 - Release Synchronization

### 1. Clean Git State And Push Current Work

Priority: P0  
Reason: Production may not reflect the local codebase until current changes are committed, pushed, and deployed.  
Affected areas: entire repo, Vercel deployment, mobile release docs, mobile app.

Actions:

- Review `git status`.
- Inspect untracked and modified files.
- Ensure no `.env`, secrets, sessions, QR/auth folders, or build artifacts are staged.
- Commit safe production/mobile work.
- Push to the active remote: `https://github.com/logivyia/logivya.git`.
- Verify Vercel deployment uses the pushed commit.

Acceptance:

- `git status --short` is clean or only expected local files remain.
- GitHub main branch contains the intended latest code.
- Vercel production deployment points to the latest intended commit.

### 2. Production Database Migration Check

Priority: P0  
Reason: Mobile sessions, push tokens, notifications, and feedback depend on new database tables.  
Affected areas: Prisma, production database, mobile auth, push notifications.

Actions:

- Confirm migrations exist for notification center and mobile release operations.
- Run migration/status check against staging first.
- Apply migrations to production only after backup/checkpoint.
- Run Prisma Client generation after schema confirmation.

Acceptance:

- Production database contains required tables:
  - `MobileDeviceSession`
  - `MobilePushToken`
  - `MobileFeedback`
  - `Notification`
  - `PasswordResetToken`
- Web build still passes after migration.

### 3. Verify Vercel Environment Variables

Priority: P0  
Reason: Password reset, mobile auth, WhatsApp sessions, queues, and production API behavior depend on envs.  
Affected areas: Vercel, auth, email, WhatsApp, Redis/queue, mobile.

Must verify:

- `DATABASE_URL`
- `AUTH_SECRET` or equivalent auth secret
- `MOBILE_JWT_SECRET`
- `PASSWORD_PEPPER`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- WhatsApp/session/worker variables
- Redis/queue variables
- Production URL/base URL variables

Acceptance:

- `/api/admin/email-health` or equivalent email health endpoint reports configured.
- Forgot password sends real email from production.
- Mobile API base URL resolves to `https://www.logivya.com`.

## P0 - Mobile Build Blockers

### 4. Configure EAS Project ID

Priority: P0  
Reason: `extra.eas.projectId` is currently empty unless `EXPO_PUBLIC_EAS_PROJECT_ID` is provided.  
Affected files:

- `apps/mobile/app.config.js`
- `apps/mobile/eas.json`

Actions:

- Run EAS project initialization/linking.
- Set `EXPO_PUBLIC_EAS_PROJECT_ID`.
- Confirm `npx expo config` outputs non-empty `extra.eas.projectId`.

Acceptance:

- EAS can build using development, preview, and production profiles.

### 5. Add Native Firebase Config Files

Priority: P0  
Reason: Push notifications and native Firebase build configuration require platform files.  
Affected paths:

- `apps/mobile/google-services.json`
- `apps/mobile/GoogleService-Info.plist`

Actions:

- Download Android `google-services.json` from Firebase project.
- Download iOS `GoogleService-Info.plist` from Firebase project.
- Add them according to security policy. If they are treated as environment-specific secrets, do not commit them; document secure EAS secret/file handling.

Acceptance:

- Android preview APK build does not fail due to missing Firebase config.
- iOS build does not fail due to missing Firebase config.

### 6. Produce First Android Preview APK

Priority: P0  
Reason: Real device testing cannot start without an installable build.  
Affected area: `apps/mobile`.

Actions:

- Run Expo/EAS validation.
- Build preview APK.
- Install on physical Android device.
- Test login, dashboard, WhatsApp, groups, categories, send message, history, support, notifications, logout.

Acceptance:

- APK installs.
- App opens.
- User can login.
- No startup crash.

## P1 - Production Behavior Verification

### 7. Password Reset End-To-End Test

Priority: P1  
Reason: Code exists, but inbox delivery must be proven.  

Actions:

- Request reset from production `/forgot-password`.
- Confirm email is delivered via Resend.
- Verify code.
- Set new password.
- Confirm old sessions are revoked.
- Login with new password.

Acceptance:

- Existing user receives real email.
- Non-existing user gets generic safe response.
- Wrong code locks after max attempts.

### 8. WhatsApp QR And Phone-Code UAT

Priority: P1  
Reason: WhatsApp provider flows are the highest business-risk area.  

Actions:

- Connect via QR.
- Connect via phone code.
- Retry after failed attempt.
- Confirm account status transitions.
- Confirm group sync.
- Confirm archive/reconnect/delete.

Acceptance:

- No stale session.
- No hidden QR/code failure.
- Groups sync after connect.

### 9. Scheduled Message Runtime Test

Priority: P1  
Reason: Scheduled sending depends on worker/queue health at future time.  

Actions:

- Create a campaign scheduled 5 minutes ahead.
- Confirm it is queued.
- Wait for due time.
- Confirm worker sends messages.
- Confirm statuses update.
- Confirm notifications/history update.

Acceptance:

- Scheduled campaign sends at due time.
- Failed recipients are visible.
- Worker logs are clear.

### 10. Push Notification Delivery Test

Priority: P1  
Reason: Push backend exists, but device delivery must be proven.  

Actions:

- Register device token.
- Trigger support notification.
- Trigger WhatsApp notification.
- Trigger subscription notification.
- Test foreground/background/open behavior.

Acceptance:

- Notification arrives.
- Unread count updates.
- Deep link opens correct screen where supported.

## P1 - Admin And Subscription Verification

### 11. Super Admin Subscription Activation Test

Priority: P1  
Reason: User dashboard must reflect manually activated subscriptions.  

Actions:

- Activate Starter/Professional/Enterprise manually from Super Admin.
- Extend by one month.
- Login as user.
- Confirm dashboard banner shows plan and remaining days.
- Confirm limits update.

Acceptance:

- Paid user no longer sees false trial package.
- Remaining days never negative.

### 12. Admin Localization Cleanup

Priority: P1  
Reason: Screenshots show admin sidebar still has English labels while platform language is Turkish.  

Actions:

- Replace hardcoded admin labels with i18n keys.
- Add Turkish/English keys.
- Verify mobile and desktop sidebar states.

Acceptance:

- Turkish mode shows Turkish admin navigation.
- English mode shows English admin navigation.

## P2 - Scale And Security Hardening

### 13. Endpoint Rate-Limit Audit

Priority: P2  
Reason: Password reset has clear limiting; all mobile endpoints need explicit checks.  

Actions:

- Verify rate limits on login/register/reset.
- Add rate limits to WhatsApp connect, QR generation, phone code generation, send message, support ticket creation, feedback.

Acceptance:

- Abuse-sensitive endpoints are rate-limited.
- Errors are localized and safe.

### 14. Push Receipt Cleanup

Priority: P2  
Reason: Expo push send currently logs failures, but invalid tokens should be cleaned.  

Actions:

- Store push ticket IDs if needed.
- Process receipts.
- Revoke invalid tokens.
- Add audit/security logs for repeated failures.

Acceptance:

- Dead push tokens do not accumulate.

### 15. Load And Queue Test

Priority: P2  
Reason: The product goal includes high-volume messaging.  

Actions:

- Run controlled queue load test.
- Measure worker concurrency.
- Verify delay throttling.
- Confirm tenant isolation under concurrent campaigns.

Acceptance:

- Campaigns do not cross tenants.
- Worker throughput and failure handling are measurable.

## P3 - Store And Launch Polish

### 16. Store Assets

Priority: P3  
Reason: Google Play/App Store require final screenshots, icons, feature graphics, and legal copy.  

Actions:

- Prepare final app icon.
- Prepare splash assets.
- Capture Android/iOS screenshots.
- Prepare feature graphic.
- Finalize descriptions and disclaimers.

Acceptance:

- Google Play draft can be completed.
- App Store draft can be completed.

### 17. Legal URL Confirmation

Priority: P3  
Reason: Store submission requires live legal URLs.  

Actions:

- Confirm Privacy Policy URL.
- Confirm Terms URL.
- Confirm KVKK URL.
- Confirm deletion/support request process.

Acceptance:

- Store forms have real URLs.

## Exact Next Prompt

Use this as the next implementation prompt:

```text
Continue the existing Logivya codebase.

RELEASE BLOCKER FIX PHASE

Do not add new features.

Goal:
Synchronize the current local Logivya codebase with the correct production repository and unblock the first mobile Android preview build.

Tasks:

1. Confirm current Git remote and branch.
2. Confirm the active remote is:
   https://github.com/logivyia/logivya.git
3. Review the dirty working tree.
4. Ensure no secrets, .env files, node_modules, build folders, WhatsApp sessions, QR files, or auth session folders are staged.
5. Stage only safe source, Prisma, mobile, docs, and config files.
6. Run:
   - npx prisma generate
   - npm run lint
   - npm run build
   - npm run typecheck from apps/mobile
   - npx expo-doctor from apps/mobile
7. If validation passes, commit:
   "Prepare Logivya production release and mobile build"
8. Push to origin main.
9. Verify Vercel deployment points to the new commit.
10. Configure/verify EAS project ID for apps/mobile.
11. Verify whether google-services.json and GoogleService-Info.plist are present or document exact secure setup steps if they must not be committed.
12. Run npx expo config and confirm:
   - Android package com.logivya.mobile
   - iOS bundle com.logivya.mobile
   - API base URL https://www.logivya.com
   - EAS project ID is not empty

Final report:
- files staged
- files excluded
- commit hash
- push status
- Vercel status
- mobile build blockers remaining

Implement directly.
Do not only explain.
```


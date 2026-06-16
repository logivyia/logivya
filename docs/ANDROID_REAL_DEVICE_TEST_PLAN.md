# Logivya Android Real Device Test Plan

Last updated: 2026-06-16  
Purpose: validate the first installable Android APK on a physical phone

## Build Under Test

Record before testing:

| Field | Value |
| --- | --- |
| Tester |  |
| Date/time |  |
| Device model |  |
| Android version |  |
| App version | `1.0.0` |
| Build profile | `preview` |
| APK URL |  |
| API URL | `https://www.logivya.com` |

## Pre-Install Checklist

- [ ] `apps/mobile/google-services.json` exists and belongs to `com.logivya.mobile`.
- [ ] `EXPO_PUBLIC_EAS_PROJECT_ID` is configured.
- [ ] `npx expo config --type public` shows non-empty `extra.eas.projectId`.
- [ ] `npm.cmd run typecheck` passes in `apps/mobile`.
- [ ] `npx.cmd expo-doctor apps/mobile` passes.
- [ ] Preview APK build completed through EAS.

## 1. App Install And Launch

Steps:

1. Install APK on physical Android phone.
2. Open Logivya.
3. Observe splash screen.
4. Wait for first screen.

Expected:

- App opens without crash.
- Logivya icon appears.
- Splash screen is visible.
- App reaches login or authenticated dashboard.

Result:

- [ ] Pass
- [ ] Fail

## 2. Login

Steps:

1. Open login screen.
2. Enter existing user email or phone.
3. Enter password.
4. Tap login.

Expected:

- Login succeeds.
- Dashboard opens.
- No repeated login loop.

Result:

- [ ] Pass
- [ ] Fail

## 3. Token Persistence After Restart

Steps:

1. Login successfully.
2. Force close app.
3. Reopen app.

Expected:

- App restores session or refreshes token.
- User lands on dashboard without re-entering password.

Result:

- [ ] Pass
- [ ] Fail

## 4. Logout

Steps:

1. Open settings/profile.
2. Tap logout.
3. Confirm if prompted.
4. Restart app.

Expected:

- Session clears.
- User returns to login.
- Protected screens do not reopen through back navigation.

Result:

- [ ] Pass
- [ ] Fail

## 5. Register

Steps:

1. Open register screen.
2. Enter valid test information.
3. Submit.

Expected:

- Account is created or a clear validation message is shown.
- No crash or unreadable text.

Result:

- [ ] Pass
- [ ] Fail

## 6. Forgot Password Email Request

Steps:

1. Open forgot password.
2. Enter registered email.
3. Submit.
4. Check inbox.

Expected:

- A real email is delivered through production email provider.
- UI does not claim success if configured provider fails for existing user.

Result:

- [ ] Pass
- [ ] Fail

## 7. Dashboard

Steps:

1. Open dashboard.
2. Pull to refresh if available.

Expected:

- Dashboard data loads.
- Subscription/trial status loads.
- No blank cards caused by API errors.

Result:

- [ ] Pass
- [ ] Fail

## 8. Subscription Status

Steps:

1. Open subscription/profile area.
2. Check plan/status/end date/remaining days.

Expected:

- Status is localized.
- Paid/trial/expired/suspended states are readable.

Result:

- [ ] Pass
- [ ] Fail

## 9. WhatsApp Accounts

Steps:

1. Open WhatsApp accounts.
2. Refresh list.

Expected:

- Account list loads.
- Status labels are localized.
- Connected group count appears if available.

Result:

- [ ] Pass
- [ ] Fail

## 10. QR Connection Screen

Steps:

1. Open QR connection.
2. Generate QR.

Expected:

- QR screen opens.
- QR generation request works or gives a clear backend error.
- No invisible text.

Result:

- [ ] Pass
- [ ] Fail

## 11. Phone Code Connection Screen

Steps:

1. Open phone connection.
2. Enter `0552...`.
3. Generate phone code.

Expected:

- Phone number normalizes correctly.
- Code appears or a clear backend error appears.

Result:

- [ ] Pass
- [ ] Fail

## 12. Groups

Steps:

1. Open groups.
2. Search group.
3. Apply filters if available.

Expected:

- Groups load.
- Search/filter does not crash.

Result:

- [ ] Pass
- [ ] Fail

## 13. Categories

Steps:

1. Open categories.
2. Create test category.
3. Edit category.
4. Delete with confirmation.

Expected:

- CRUD works or backend limitation is shown clearly.
- Delete requires confirmation.

Result:

- [ ] Pass
- [ ] Fail

## 14. Message Sending Screen

Steps:

1. Open message sending.
2. Select target group/category.
3. Enter test message.

Expected:

- Screen opens.
- Selection works.
- Send action returns success or clear backend error.

Result:

- [ ] Pass
- [ ] Fail

## 15. Message History

Steps:

1. Open message history.
2. Refresh list.

Expected:

- History loads.
- Status labels are readable.

Result:

- [ ] Pass
- [ ] Fail

## 16. Support Ticket Creation

Steps:

1. Open support.
2. Create ticket with subject/category/description.
3. Open ticket detail.

Expected:

- Ticket is created.
- Detail screen loads.

Result:

- [ ] Pass
- [ ] Fail

## 17. Notifications

Steps:

1. Open notifications screen.
2. Grant Android notification permission.
3. Trigger a test notification from backend/admin if available.

Expected:

- Notification list loads.
- Device push token registers.
- Foreground/background push delivery works.

Result:

- [ ] Pass
- [ ] Fail

## 18. Theme Modes

Steps:

1. Switch light mode.
2. Switch dark mode.
3. Check key screens.

Expected:

- Text remains readable.
- No invisible buttons.

Result:

- [ ] Pass
- [ ] Fail

## Failure Capture

For every failure, record:

- Screen
- Steps to reproduce
- Expected result
- Actual result
- Screenshot/video
- Severity:
  - Critical
  - High
  - Medium
  - Low


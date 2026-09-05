# TestFlight Test Plan

## Internal Testing

Internal testers:

- Product owner
- Mobile QA
- Backend/API owner
- Support/admin owner

Focus:

- App launch
- Login/logout
- Password reset
- Dashboard
- WhatsApp account status screens
- Groups and categories
- Messaging and message history
- Support center
- Notifications
- Profile and settings
- Subscription display

## External Testing

External testers should use demo workspaces and safe test data only.

Tester onboarding:

1. Add tester email in App Store Connect.
2. Send TestFlight invite.
3. Share test account instructions.
4. Share feedback template.
5. Explain that real customer data must not be entered during beta.

## Test Account

- Email: `reviewer@logivya.com`
- Password: `REPLACE_WITH_SECURE_TEST_PASSWORD`
- Role: normal user
- Subscription: active test or trial account

## Feedback Process

Collect:

- Device model
- iOS version
- App version/build
- Screen
- Steps to reproduce
- Expected result
- Actual result
- Screenshot or screen recording
- Severity

## Known Issues Template

- Issue:
- Impact:
- Workaround:
- Owner:
- Status:

## Exit Criteria

- No critical auth/session bug.
- No tenant isolation issue.
- No crash in primary flows.
- Push registration works on at least one physical iPhone.
- Legal URLs and App Privacy details are complete.

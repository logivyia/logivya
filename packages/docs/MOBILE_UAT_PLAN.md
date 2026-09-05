# Logivya Mobile UAT Plan

Last updated: 2026-06-15

## Purpose

This UAT plan verifies Logivya mobile readiness on real Android and iOS devices before first public release.

## Test Matrix

Devices:

- Android emulator
- Physical Android phone
- Physical iPhone

Environments:

- Development
- Staging
- Production

Network conditions:

- Normal Wi-Fi
- Mobile data
- Airplane mode
- Poor network / reconnect

Themes:

- Light
- Dark
- System

Languages:

- Turkish
- English

## Authentication Tests

1. Fresh install opens splash and then login.
2. Existing user logs in successfully.
3. Invalid password shows safe localized error.
4. Register creates account and starts session.
5. Forgot password sends reset code.
6. Reset password accepts valid code and strong password.
7. Reset password rejects expired/invalid code.
8. Access token refresh works after token expiry.
9. Refresh token expiry logs user out safely.
10. Logout revokes session and clears cached data.
11. Relaunch after logout does not restore old user data.

## Subscription Tests

1. Subscription screen loads current plan.
2. Trial state shows remaining days.
3. Active subscription shows plan and end date.
4. Expired subscription shows expired state.
5. Suspended subscription shows suspended state.
6. Upgrade button is visible but does not start payment flow yet.

## WhatsApp Tests

1. WhatsApp account list loads.
2. Empty state appears when no account exists.
3. QR connection screen generates QR.
4. QR polling stops on connected state.
5. QR expired state can retry.
6. Phone code flow accepts `0552...`.
7. Phone code flow accepts `552...`.
8. Phone code flow accepts `+90 552...`.
9. Phone code flow accepts `90 552...`.
10. Reconnect action asks for confirmation.
11. Archive action asks for confirmation.
12. Delete action asks for confirmation.
13. Connected account shows localized status.
14. Groups sync after connection.

## Groups And Categories Tests

1. Groups list loads.
2. Search filters groups.
3. Account filter works if multiple accounts exist.
4. Category filter works.
5. Pull to refresh reloads groups.
6. Categories list loads.
7. Category create validates required name.
8. Category edit persists changes.
9. Category delete requires confirmation.
10. Category detail shows assigned groups.
11. Assignment flow saves selected groups.
12. Removing group from category works.

## Messaging Tests

1. Message composer opens.
2. Group selection works.
3. Send-now message validates non-empty content.
4. Send-now request reaches backend.
5. Scheduled message validates future date.
6. Scheduled message appears in history.
7. Failed send shows localized error.
8. History list loads.
9. History detail opens from deep link if available.

## Support Tests

1. Support ticket list loads.
2. Empty state appears if no ticket exists.
3. Create ticket validates subject/category/description.
4. Ticket create succeeds.
5. Ticket detail loads messages.
6. Reply sends message.
7. Pull to refresh updates conversation.
8. Support notification opens ticket detail.

## Notification Tests

1. Permission prompt appears on physical device.
2. Permission denied is handled gracefully.
3. Expo push token is registered with backend.
4. Foreground push is received.
5. Background push is received.
6. Push open with `url` opens correct route.
7. Push open without `url` maps known type:
   - `whatsapp_disconnected` -> WhatsApp accounts
   - `whatsapp_connected` -> WhatsApp accounts
   - `subscription_expiring` -> Subscription
   - `subscription_expired` -> Subscription
   - `support_ticket_update` -> Support ticket or support list
   - `campaign_completed` -> Messages
   - `campaign_failed` -> Messages

## Profile And Settings Tests

1. Profile screen shows user name.
2. Profile screen shows email.
3. Profile screen shows phone if available.
4. Company settings loads company data.
5. Theme can switch light/dark/system.
6. Language can switch TR/EN.
7. Notification preference toggles locally.
8. Logout clears session and returns to login.

## Offline Tests

1. App opens with cached data after previous successful login.
2. Airplane mode shows network-safe error on refresh.
3. Reconnect automatically refreshes queries.
4. Mutations fail safely while offline.
5. No duplicate submissions after reconnect.

## Performance Tests

1. App cold start is acceptable on mid-range Android.
2. Navigation between tabs is smooth.
3. Long group lists remain scrollable.
4. Pull-to-refresh does not trigger duplicate requests.
5. Polling screens stop polling after leaving screen.
6. Memory does not grow repeatedly after opening/closing WhatsApp QR and phone-code screens.

## Security Tests

1. Tokens are not visible in AsyncStorage.
2. Logout clears SecureStore tokens.
3. Expired refresh token forces logout.
4. Company A cannot see Company B data.
5. Normal user cannot access admin-only APIs.
6. API errors do not expose server stack traces.
7. Push payload does not include sensitive secrets.

## Acceptance Criteria

Release candidate can move to closed testing when:

- All P0/P1 authentication tests pass.
- WhatsApp QR and phone code flows pass on at least one Android and one iOS device.
- Push token registration succeeds on physical Android and iOS devices.
- No invisible text in light or dark mode.
- No crash during a 30-minute exploratory session.
- `npm run typecheck` passes in `apps/mobile`.
- Root `npm run lint` and `npm run build` pass.


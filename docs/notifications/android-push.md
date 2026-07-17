# Android Push

Android uses Expo Notifications as the approved provider layer.

- Permission is requested only from the education screen after user action.
- Device tokens are registered against authenticated company and user ownership.
- Stored token values are encrypted at rest.
- Android channels separate system, security, account, WhatsApp, messages, support and billing.
- Foreground, response and background handlers are registered once.
- Provider ticket IDs are persisted and receipts are reconciled by the notification worker.
- `DeviceNotRegistered` revokes the matching token.

Required production evidence: valid Expo/EAS project ID and credentials, fresh install, background, foreground, terminated-app delivery, token rotation, logout/user switch and deep-link tests on a physical Android device.

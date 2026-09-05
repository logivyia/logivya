# Web Push

Web Push uses `web-push` with VAPID credentials. The service worker is `public/logivya-notifications-sw.js`.

Configuration:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`

Permission is requested only after an explicit action in notification settings. Subscriptions are encrypted at rest and bound to authenticated company/user ownership. HTTP 404/410 provider responses invalidate the subscription. Notification clicks accept only validated Logivya deep links.

Web Push remains disabled when VAPID configuration is incomplete; provider status reports that condition without exposing secrets.

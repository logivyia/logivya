# Channel Selection

Channel selection is resolved on the backend by `policy.ts`.

1. Start with registry defaults.
2. Add mandatory channels.
3. Apply the authenticated user's persisted preferences.
4. Keep mandatory channels even when an optional preference is disabled.
5. Delay optional deliveries for quiet hours or digest mode.
6. Cancel channels with no valid destination instead of reporting delivery.

`IN_APP` is the baseline for account and operational events. Security-critical and action-required channels may be mandatory. Marketing and non-essential announcements remain optional.

Clients display the server result and never decide that a notification is mandatory.

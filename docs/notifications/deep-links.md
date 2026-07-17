# Notification Deep Links

Deep links are validated before persistence and again before client navigation.

Allowed destinations are internal Logivya web paths and the `logivya://` application scheme. External arbitrary URLs, script schemes and malformed paths are rejected. Android handlers map known event types to accounts, subscriptions, support, campaign results and administrator incident destinations.

Every new route must be tested from foreground, background and terminated state. Authorization is re-evaluated after navigation; possession of a deep link never grants access.

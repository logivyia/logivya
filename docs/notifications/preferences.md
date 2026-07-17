# Notification Preferences

Preferences are stored per `companyId + userId + category + channel` in `NotificationPreference`.

Supported channels are in-app, email, Android push, iOS-ready push and Web Push. Supported delivery modes are immediate, daily digest and weekly digest. Quiet hours are stored as local `HH:mm` values with an IANA timezone.

Security/account mandatory combinations are marked `mandatoryLocked` and cannot be disabled through API or UI. Web and Android use the same preference endpoints. Logout clears client notification caches; device revocation remains a release-gate item for every logout/user-switch path.

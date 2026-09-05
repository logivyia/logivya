# Manual Test Checklist

## Authentication

- [ ] Register validates full name, username, phone, email, password, confirmation, and company name.
- [ ] Registration creates User, Company, OWNER CompanyUser, trial Subscription, and session.
- [ ] Login accepts email or username and rejects invalid credentials cleanly.
- [ ] Protected pages redirect anonymous users to `/login`.
- [ ] Authenticated users are redirected away from login/register.
- [ ] Logout revokes the database session and clears the cookie.

## WhatsApp

- [ ] Add account creates a database row and worker job.
- [ ] QR appears and refreshes before expiration.
- [ ] QR scan changes status to CONNECTED and stores phone/display name.
- [ ] Groups synchronize with real counts.
- [ ] Sync, disconnect, reconnect, and archive work.
- [ ] Archived accounts retain message history.

## Messaging

- [ ] Category creation assigns selected real groups.
- [ ] Campaign creation requires at least one connected sendable group.
- [ ] Recipient jobs are queued rather than sent in the HTTP request.
- [ ] Worker throttles sequential sends and retries failures.
- [ ] History displays sent and failed totals from PostgreSQL.
- [ ] Canceling a campaign prevents pending sends.

## UI and Localization

- [ ] Default theme is light with white/orange branding.
- [ ] Dark mode remains available.
- [ ] Default locale is Turkish.
- [ ] Language changes update visible navigation and page labels immediately.
- [ ] Arabic changes document direction to RTL.
- [ ] Empty workspaces show empty states, not demo data.

# Environment Variables

Required groups:

- App/auth: `NEXT_PUBLIC_APP_URL`, `AUTH_SECRET`, `PASSWORD_PEPPER`, encryption keys.
- Data: `DATABASE_URL`, `REDIS_URL`.
- Admin: `PLATFORM_ADMIN_EMAILS`, `CRON_SECRET`.
- WhatsApp worker: provider, session directory, rate and safety limits.
- Email: `EMAIL_PROVIDER`, provider key, sender/support/billing addresses.
- Backup: storage provider, bucket, credentials, and encryption key.
- Operations: `MAINTENANCE_MODE`.

Keep all secrets in the deployment provider. Never commit `.env*` files.

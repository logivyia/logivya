# Logivya Email Delivery Setup

Logivya password reset sends a real verification email. It must not show success for an existing user when the email provider is missing or fails.

## Recommended Provider: Resend

Set these variables in Vercel Project Settings -> Environment Variables:

```text
RESEND_API_KEY=...
EMAIL_FROM=Logivya <no-reply@your-domain.com>
```

After adding or changing variables, redeploy the production deployment.

## SMTP Fallback

If Resend is not configured, Logivya falls back to SMTP. Set all of these:

```text
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=Logivya <no-reply@your-domain.com>
SMTP_SECURE=false
```

Use `SMTP_SECURE=true` for port `465`; use `false` for ports like `587`.

## Health Check

Super Admin users can call:

```text
GET /api/admin/email-health
```

The response shows provider, missing variables, and SMTP reachability when SMTP is selected. Secrets are never returned.

## Local Test

```text
npm run test:email -- burakidim@gmail.com
```

The script uses the same provider selection as production:

1. Resend if `RESEND_API_KEY` and `EMAIL_FROM` exist.
2. SMTP if all SMTP variables exist.
3. Fails clearly if no provider is configured.

## Password Reset Behavior

For an existing user:

- code record is created
- email delivery is attempted
- API returns success only when the provider accepts the email
- provider/configuration failure returns a safe Turkish error

For a non-existing user:

- the API returns the generic success message to avoid account enumeration

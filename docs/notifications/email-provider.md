# Email Provider

The provider boundary is `src/lib/email/email-provider.ts` and `src/server/email/service.ts`.

Resolution order:

1. Resend when `RESEND_API_KEY` and `EMAIL_FROM` are present.
2. SMTP when all `SMTP_*` values are valid.
3. `none`, which is unhealthy and causes retryable delivery failure.

Email outbox records are persisted before provider access. Provider acceptance is recorded as `ACCEPTED`, not `DELIVERED`. Delivery/bounce/complaint webhook evidence updates the final state.

Secrets belong only in production environment storage. They must never use `EXPO_PUBLIC_*` or be embedded in the AAB.

# Google Play Protection Implementation

Last reviewed: 2026-07-26

## Current status

| Area | Console status | Repository status |
| --- | --- | --- |
| Automatic protection | 1/1 | Enabled in Play Console |
| Play Integrity API | 6/7 until a production request is observed | Standard Integrity client and server verification implemented |
| Google Play Store protection | 7/7 | Signing and always-on Play protections enabled; store visibility uses no integrity gate |
| Google Play Billing protection | 0/4 | Not applicable to the current manual/web billing flow |

The Play Integrity settings page has all seven response groups enabled, including
`MEETS_DEVICE_INTEGRITY`. The protection overview can remain at 6/7 until a Play-installed
release sends its first successful Standard Integrity request.

Store listing visibility must remain set to `No integrity checks`. Play Integrity verdicts are
collected by the runtime integration in `monitor` mode, but they must not hide an otherwise
supported device from Google Play. Enabling device or strong-integrity listing gates requires a
separate compatibility review and explicit release approval.

## Current production observation

The Standard Integrity client, server verification implementation, and regression test are
present in the repository. On 2026-07-26, the challenge and verification routes were deployed
to `www.logivya.com`. A dedicated service account from the Play-linked `logivya-a5fc7` Google
Cloud project was stored only as an encrypted Vercel secret. A deliberately invalid test token
reached Google's `decodeIntegrityToken` endpoint and received the expected invalid-token
response, proving that the server credential and Google API path are active.

The Console overview may remain at 6/7 until a Play-installed Android release sends a genuine
Standard Integrity request and Google processes the resulting telemetry. The integration
remains non-blocking in `monitor` mode while production verdicts are reviewed.

## Integrity architecture

1. Android warms up a `StandardIntegrityTokenProvider` during application startup.
2. The client requests a short-lived, signed challenge from
   `POST /api/mobile/integrity/challenge`.
3. Google Play binds the Standard Integrity token to the server-generated `requestHash`.
4. The client sends the encrypted token to `POST /api/mobile/integrity/verify`.
5. The server authenticates to the linked Google Cloud project and calls
   `decodeIntegrityToken`.
6. The server validates package ownership, request binding, timestamp freshness, licensing,
   app recognition, device integrity, Play Protect, and app access risk.
7. Challenges are one-time when Redis is available. Raw integrity tokens and credentials are
   never logged.

Production starts in `monitor` mode. This records verdicts without blocking login, WhatsApp
connection, message delivery, or any other stable-core workflow. Enforcement may be enabled
only after real-device telemetry has been reviewed.

## Required server secrets

- `PLAY_INTEGRITY_CHALLENGE_SECRET`: random secret used only to sign challenges.
- `PLAY_INTEGRITY_MODE`: `off`, `monitor`, or `enforce`.
- `GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON`: sensitive service-account JSON belonging to
  the Google Cloud project linked in Play Console.

The service account credential must be stored only in the deployment secret manager. Never
commit it, add it to an Android build, or expose it through a public environment variable.

## Billing protection applicability

The current Logivya mobile application does not sell Play-managed digital products. Upgrade
requests use the existing web/manual billing workflow, so there is no Play purchase token for
the four Billing protection checks to validate.

The Console's 0/4 indicator cannot be completed by enabling switches. Completing it requires
an intentional Play Billing product launch with all of the following:

The four Console protections are fraud and abuse monitoring, gift-card protection,
location/address-spoofing protection, and subscription-offer usage limits. Play Console keeps
them disabled until monetization is configured.

- Google Play merchant/payment profile and required legal/tax information
- subscription products, base plans, offers, and test accounts
- Android BillingClient purchase and restore flows
- secure server-side purchase-token verification and token ownership constraints
- purchase acknowledgement, Real-time Developer Notifications, Pub/Sub, voided purchase
  handling, renewals, grace periods, holds, cancellations, refunds, and revocations

No merchant account or financial declaration should be created automatically. A separate,
approved billing migration plan is required before this architecture replaces or supplements
the current billing flow.

## Release verification

Before moving from `monitor` to `enforce`:

1. Install the release from an active Google Play test track.
2. Confirm the server receives a successful decode response.
3. Confirm Play Console reports at least one Integrity request.
4. Test a supported Play-certified device and a deliberately untrusted test verdict.
5. Re-run mobile authentication and stable-core regression checks.
6. Verify that an Integrity outage remains non-blocking in `monitor` mode.

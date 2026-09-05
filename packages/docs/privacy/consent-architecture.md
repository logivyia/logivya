# Consent Architecture

Status: `LEGAL REVIEW REQUIRED`

## Separation

- Privacy notices provide information and are not treated as optional consent.
- `ESSENTIAL_SERVICE` and `SECURITY_AND_FRAUD_PREVENTION` are required-purpose records and cannot be disabled in preference UI.
- `PRODUCT_ANALYTICS`, `CRASH_DIAGNOSTICS` and `MARKETING_COMMUNICATIONS` are independent, off by default and withdrawable.
- Registration acceptance records remain legacy evidence and must not be reclassified as optional-purpose consent without counsel review.

## Record contract

`ConsentRecord` stores user/company, purpose code, status, legal/notice versions, collection method, platform, app version, locale, collection/withdrawal times and bounded evidence. Legacy `type`, `version` and `granted` fields remain readable for backward compatibility.

Status transition: `PENDING -> GRANTED -> WITHDRAWN`; `EXPIRED` and `NOT_REQUIRED` are explicit. The latest purpose record determines optional SDK behavior.

## Enforcement

- Web optional preferences are versioned in local storage and synchronized to authenticated API records.
- Android Firebase Analytics and Sentry wrappers no-op until the corresponding persisted setting is enabled.
- Withdrawal updates the server record and disables future optional collection on the device.
- Consent evidence must not contain secrets, raw tokens or unbounded request bodies.

# Alerting Policy

## Implemented mechanism

`raiseOperationalAlert` stores a privacy-safe alert in PostgreSQL. Dedupe key combines environment, service, controlled type, and a bounded time window. Repeated occurrences increment one record instead of sending one alert per failure.

Current direct producers:

- Worker uncaught exception and unhandled rejection: CRITICAL.
- Queue job exhausting retry budget: HIGH.
- Admin metrics expose open alert count for operator review.

## Required production rules

Configure external notification routing only after destinations and on-call ownership are approved. Initial candidates are missing worker heartbeat, queue backlog, database/Redis unavailable, backup/restore failure, reconnect/snapshot failure spike, message failure-rate threshold, authorization denial spike, email/support delivery spike, entitlement failure spike, and Android crash regression.

## Severity

- CRITICAL: process/data/recovery failure with broad or immediate impact.
- HIGH: exhausted retries, security spike, or major degraded subsystem.
- MEDIUM: recoverable repeated failure requiring review.
- LOW: diagnostic trend without confirmed user impact.

## Noise and privacy controls

Alerts contain service, environment, controlled type, occurrence count, correlation ID, and safe aggregate metadata. Do not label by raw user ID, phone, email, JID, message, or high-cardinality target. Never include exception/request bodies.

## Acknowledgment and resolution

Acknowledgment assigns an owner; resolution records the remediation. Dismissal means the signal was not actionable, not that evidence was deleted. Tune window/threshold only from measured volume. CRITICAL conditions cannot be globally sampled or silently discarded.

## Tests

The observability integration test verifies dedupe construction. Load testing validates bounded redaction. Production alert delivery requires a controlled staging test before enabling an external destination.

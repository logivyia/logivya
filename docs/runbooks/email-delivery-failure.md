# Email Delivery Failure

**Symptoms:** Provider unconfigured/unreachable, failed delivery spike, stale pending rows, or `EMAIL_TEMPLATE_VARIABLES_MISSING`. **Impact:** Password reset, invitations and support notifications may be delayed.

1. Check provider configuration status and controlled error code. Never print credentials, recipient addresses or email bodies.
2. For template failure, identify only template name and missing variable names; fix producer contract and add a regression case.
3. For provider outage, preserve outbox/idempotency and retry with backoff. Do not silently mark failed mail sent.
4. Use provider dashboard for acceptance/bounce evidence under least-privilege access. Rotate credentials if compromise is suspected.
5. Verify password reset, invitation and support templates contain non-empty subject/body and links before resolving.
6. Escalate password reset outage or broad transactional failure as SEV-2.

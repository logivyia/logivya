# Security Incident

**Symptoms:** Admin-login failures, cross-tenant denial spike, credential stuffing, webhook signature failures, token misuse or unusual session revocation. **Impact:** Confidentiality, integrity or account access may be at risk.

1. Acknowledge and preserve immutable audit/security evidence. Do not copy secrets or personal data into chat/tickets.
2. Scope by pseudonymous IDs, route, result and correlation ID. One weak signal is not enough to suspend a legitimate user.
3. Revoke compromised sessions/credentials with approved admin actions; preserve tenant isolation and evidence. Rotate secrets through provider controls.
4. Engage legal/privacy review for potential data exposure and follow notification obligations.
5. Verify authentication, 2FA, admin guard, tenant denials, session revocation and rate limits after mitigation.
6. SEV-1/2 requires a post-incident review, corrective controls and regression tests.

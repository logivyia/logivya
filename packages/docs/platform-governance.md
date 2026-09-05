# Platform Governance

Platform administration uses database-backed RBAC with scoped permissions and an environment allowlist only as a bootstrap fallback. Admin access and sensitive operations are separately auditable.

Critical actions require:
- authenticated platform administrator;
- explicit server-side permission;
- verified MFA enrollment;
- a human-readable reason;
- immutable tenant audit record.

The platform owner may access only data necessary for billing, support, compliance, security, and operations. Global search returns limited labels and identifiers, not secrets or message bodies.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AUDIT_ACTIONS, canonicalAuditAction } from "@logivya/logging";

async function main() {
const [schema, migration, auditService] = await Promise.all([
  readFile("prisma/schema.prisma", "utf8"),
  readFile("prisma/migrations/20260715210000_centralized_observability/migration.sql", "utf8"),
  readFile("src/server/security/audit.ts", "utf8"),
]);
assert.equal(new Set(AUDIT_ACTIONS).size, AUDIT_ACTIONS.length, "Audit action taxonomy contains duplicates.");
assert(AUDIT_ACTIONS.every((action) => /^[A-Z][A-Z0-9_]+$/.test(action)), "Audit action taxonomy must be canonical.");
assert.equal(canonicalAuditAction("subscription.adminChanged"), "SUBSCRIPTION_ADMIN_CHANGED");
for (const field of ["actorType", "actorEmailMasked", "result", "requestId", "correlationId", "beforeState", "afterState", "ipAddressMasked", "userAgentSummary"]) {
  assert(schema.includes(field), `Audit schema field missing: ${field}`);
}
assert(migration.includes("prevent_audit_log_mutation"));
assert(migration.includes("BEFORE UPDATE OR DELETE ON \"AuditLog\""));
assert(auditService.includes("safeState(entry.before)"));
assert(auditService.includes("maskEmail(entry.actorEmail)"));
process.stdout.write("Audit taxonomy, safe-state and append-only contracts passed.\n");
}

void main();

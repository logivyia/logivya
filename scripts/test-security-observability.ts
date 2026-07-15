import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
const [listRoute, updateRoute, guard, events] = await Promise.all([
  readFile("src/app/api/admin/security/events/route.ts", "utf8"),
  readFile("src/app/api/admin/security/events/[id]/route.ts", "utf8"),
  readFile("src/server/auth/platform-admin.ts", "utf8"),
  readFile("src/server/security/events.ts", "utf8"),
]);
assert(listRoute.includes('requirePlatformAdmin("admin.security.read", request)'));
assert(listRoute.includes("maskEmail(event.user.email)"));
assert(!listRoute.includes("ipAddress: true"), "Security API must not return legacy raw IP fields.");
assert(!listRoute.includes("userAgent: true"), "Security API must not return legacy raw user agents.");
assert(updateRoute.includes('z.enum(["ACKNOWLEDGED", "RESOLVED", "DISMISSED"])'));
assert(updateRoute.includes("writeAuditLog(request"));
assert(guard.includes('type: "ADMIN_ACCESS_DENIED"'));
assert(events.includes("requestNetworkSummary(input.request)"));
assert(events.includes("sanitizeLogText(input.errorCode"), "Direct security-event columns must be centrally scrubbed.");
process.stdout.write("Security-event access, masking, acknowledgment and denial contracts passed.\n");
}

void main();

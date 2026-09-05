import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
const root = process.cwd();
const read = (path: string) => readFile(join(root, path), "utf8");
const [requestService, route, legacyWeb, legacyMobile, screen, adminList, adminAction, adminCenter] = await Promise.all([
  read("src/server/privacy/requests.ts"),
  read("src/app/api/privacy/account-deletion/route.ts"),
  read("src/app/api/settings/delete-account/route.ts"),
  read("src/app/api/mobile/account/delete/route.ts"),
  read("apps/mobile/src/screens/app/account-deletion-screen.tsx"),
  read("src/app/api/admin/privacy/deletions/route.ts"),
  read("src/app/api/admin/privacy/deletions/[id]/route.ts"),
  read("src/components/admin-privacy-center.tsx"),
]);
assert.match(route, /requirePrivacyPassword/);
assert.match(route, /membership\.role === "OWNER"/);
assert.match(requestService, /destructiveExecutionEnabled:\s*false/);
assert.match(requestService, /cancelUntil/);
assert.match(requestService, /scope === "COMPANY" && !input\.owner/);
assert.match(legacyWeb, /status:\s*428/);
assert.match(legacyMobile, /status:\s*428/);
assert.doesNotMatch(legacyWeb, /company\.update|userSession\.updateMany/);
assert.doesNotMatch(legacyMobile, /company\.update|mobileDeviceSession\.updateMany/);
assert.match(screen, /getAccountDeletionRequests/);
assert.match(screen, /cancelAccountDeletion/);
assert.match(adminList, /requirePlatformAdmin\("admin\.privacy\.read"/);
assert.match(adminAction, /requireCriticalAdminAction\(request, "admin\.privacy\.update"/);
assert.match(adminAction, /PRIVACY_DELETION_CANCELLATION_WINDOW_ACTIVE/);
assert.match(adminAction, /PRIVACY_DELETION_LEGAL_HOLD_ACTIVE/);
assert.match(adminAction, /I CONFIRM DATA DELETION IS COMPLETE/);
assert.match(adminAction, /completionMode: "MANUAL_VERIFIED"/);
assert.match(adminAction, /sendTemplateEmailSafely/);
assert.match(adminAction, /privacyRequestEvent\.create/);
assert.match(adminAction, /writeAuditLog/);
assert.match(adminCenter, /\/api\/admin\/privacy\/deletions/);
assert.match(adminCenter, /evidenceReference/);
console.log("privacy deletion contracts: ok");
}

void main();

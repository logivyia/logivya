import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
const root = process.cwd();
const read = (path: string) => readFile(join(root, path), "utf8");
const [requestService, route, legacyWeb, legacyMobile, screen] = await Promise.all([
  read("src/server/privacy/requests.ts"),
  read("src/app/api/privacy/account-deletion/route.ts"),
  read("src/app/api/settings/delete-account/route.ts"),
  read("src/app/api/mobile/account/delete/route.ts"),
  read("apps/mobile/src/screens/app/account-deletion-screen.tsx"),
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
console.log("privacy deletion contracts: ok");
}

void main();

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const listing = readFileSync(
  resolve(root, "src/app/api/mobile/groups/route.ts"),
  "utf8",
);
const sync = readFileSync(
  resolve(root, "src/app/api/mobile/groups/sync-current/route.ts"),
  "utf8",
);
const scope = readFileSync(
  resolve(root, "src/server/whatsapp/account-scope.ts"),
  "utf8",
);

assert.match(scope, /export async function listRecoverableWhatsAppAccounts/);
assert.match(listing, /listRecoverableWhatsAppAccounts/);
assert.match(listing, /accountId:\s*\{\s*in:\s*accountIds\s*\}/);
assert.match(listing, /companyId:\s*company\.id/);
assert.match(listing, /userId:\s*user\.id/);
assert.match(sync, /const GROUP_SYNC_WAIT_MS = 6_000/);
assert.match(sync, /completedAccountIds/);
assert.match(sync, /accountIds/);
assert.match(sync, /jobIds/);
assert.match(sync, /accountId:\s*primaryAccountId/);
assert.match(sync, /jobId:\s*jobs\[0\]\?\.id/);

console.log("Mobile group sync contract checks passed.");

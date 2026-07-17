import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
const root = process.cwd();
const [retention, exportSource, cron, environment] = await Promise.all([
  readFile(join(root, "src/server/privacy/retention.ts"), "utf8"),
  readFile(join(root, "src/server/privacy/export.ts"), "utf8"),
  readFile(join(root, "src/app/api/cron/privacy-maintenance/route.ts"), "utf8"),
  readFile(join(root, ".env.example"), "utf8"),
]);
assert.match(retention, /const dryRun = input\.dryRun !== false/);
assert.match(retention, /privacyLegalHold\.count/);
assert.match(retention, /destructiveDeletionJobsExecuted:\s*0/);
assert.match(exportSource, /PRIVACY_RETENTION_ENFORCEMENT_DISABLED/);
assert.match(cron, /PRIVACY_RETENTION_ENFORCEMENT !== "true"/);
assert.match(cron, /Bearer \$\{process\.env\.CRON_SECRET\}/);
assert.match(environment, /PRIVACY_RETENTION_ENFORCEMENT=false/);
console.log("privacy retention contracts: ok");
}

void main();

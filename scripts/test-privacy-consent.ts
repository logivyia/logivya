import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
const root = process.cwd();
const read = (path: string) => readFile(join(root, path), "utf8");
const [catalog, consentRoute, cookie, analytics, diagnostics, settings] = await Promise.all([
  read("src/server/privacy/catalog.ts"),
  read("src/app/api/privacy/consents/[purpose]/route.ts"),
  read("src/lib/privacy-preferences.ts"),
  read("apps/mobile/src/services/analytics.ts"),
  read("apps/mobile/src/services/crash-reporting.ts"),
  read("apps/mobile/src/auth/settings-store.ts"),
]);

for (const purpose of ["ESSENTIAL_SERVICE", "SECURITY_AND_FRAUD_PREVENTION", "PRODUCT_ANALYTICS", "CRASH_DIAGNOSTICS", "MARKETING_COMMUNICATIONS"]) assert.ok(catalog.includes(purpose));
assert.match(catalog, /code:\s*"PRODUCT_ANALYTICS"[\s\S]*?defaultEnabled:\s*false/);
assert.match(catalog, /code:\s*"CRASH_DIAGNOSTICS"[\s\S]*?defaultEnabled:\s*false/);
assert.match(catalog, /code:\s*"MARKETING_COMMUNICATIONS"[\s\S]*?defaultEnabled:\s*false/);
assert.match(consentRoute, /purpose\.required/);
assert.match(consentRoute, /WITHDRAWN/);
assert.match(cookie, /necessary:\s*true/);
assert.match(cookie, /analytics:\s*false/);
assert.match(cookie, /marketing:\s*false/);
assert.match(settings, /analyticsEnabled:\s*false/);
assert.match(settings, /diagnosticsEnabled:\s*false/);
assert.match(analytics, /useSettingsStore\.getState\(\)\.analyticsEnabled/);
assert.match(diagnostics, /useSettingsStore\.getState\(\)\.diagnosticsEnabled/);
console.log("privacy consent contracts: ok");
}

void main();

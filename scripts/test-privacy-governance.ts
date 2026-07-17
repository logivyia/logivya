import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
const root = process.cwd();
const read = (path: string) => readFile(join(root, path), "utf8");
const [schema, userOverview, adminOverview, adminRequests, legalDocuments, permissions, migration] = await Promise.all([
  read("prisma/schema.prisma"),
  read("src/app/api/privacy/overview/route.ts"),
  read("src/app/api/admin/privacy/overview/route.ts"),
  read("src/app/api/admin/privacy/requests/route.ts"),
  read("src/app/api/admin/privacy/legal-documents/route.ts"),
  read("src/server/auth/admin-permissions.ts"),
  read("prisma/migrations/20260716193000_privacy_governance_foundation/migration.sql"),
]);

for (const model of ["PrivacyRequestMessage", "PrivacyRequestEvent", "PrivacyExportJob", "PrivacyDeletionJob", "PrivacyLegalHold", "PrivacyBreach", "PrivacyDpia", "PrivacyRetentionRun", "PrivacyLegalDocument"]) {
  assert.match(schema, new RegExp(`model\\s+${model}\\s+\\{`), `${model} must exist`);
}
assert.match(userOverview, /userId:\s*context\.user\.id/);
assert.match(userOverview, /companyId:\s*context\.company\.id/);
assert.match(adminOverview, /requirePlatformAdmin\("admin\.privacy\.read"/);
assert.match(adminRequests, /requirePlatformAdmin\("admin\.privacy\.read"/);
assert.match(legalDocuments, /requirePlatformAdmin\("admin\.privacy\.read"/);
assert.match(legalDocuments, /requireCriticalAdminAction\(request, "admin\.privacy\.update"/);
assert.match(legalDocuments, /z\.enum\(\["DRAFT", "LEGAL_REVIEW_REQUIRED"\]\)/);
assert.doesNotMatch(legalDocuments, /status:\s*z\.enum\(\[[^\]]*"APPROVED"/);
assert.match(legalDocuments, /active:\s*false/);
assert.match(permissions, /admin\.privacy\.read/);
assert.match(permissions, /admin\.privacy\.update/);
assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|TYPE)/i, "privacy migration must remain additive");
console.log("privacy governance contracts: ok");
}

void main();

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
const root = process.cwd();
const [source, route, schema] = await Promise.all([
  readFile(join(root, "src/server/privacy/export.ts"), "utf8"),
  readFile(join(root, "src/app/api/privacy/export/[id]/download/route.ts"), "utf8"),
  readFile(join(root, "prisma/schema.prisma"), "utf8"),
]);
assert.match(source, /createCipheriv\("aes-256-gcm"/);
assert.match(source, /createHmac\("sha256"/);
assert.match(source, /PutObjectCommand/);
assert.match(source, /checksumSha256/);
assert.match(source, /where:\s*\{\s*publicId:\s*input\.publicId,\s*companyId:\s*input\.companyId,\s*userId:\s*input\.userId/);
assert.match(source, /exclusions:\s*\["password hashes", "session tokens", "WhatsApp session credentials", "encryption keys"/);
assert.doesNotMatch(source, /publicUrl|ACL:\s*["']public/i);
assert.match(route, /requirePrivacyAuth/);
assert.match(schema, /downloadTokenHash\s+String\?/);
console.log("privacy export contracts: ok");
}

void main();

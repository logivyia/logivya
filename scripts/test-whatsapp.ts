import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { AccountStatus } from "@prisma/client";
import { normalizePhoneNumber } from "../src/lib/phone/normalize";
import { assertValidTransition, MODERN_ACCOUNT_STATUSES } from "../src/lib/whatsapp/account-status-machine";

const root = process.cwd();
function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const value = path.join(directory, name);
    return statSync(value).isDirectory() ? files(value) : [value];
  });
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const expected = ["CREATED", "PENDING_QR", "PENDING_PAIRING", "PAIRING_CODE_READY", "CONNECTING", "CONNECTED", "RECONNECT_REQUIRED", "FAILED", "DISCONNECTED", "ARCHIVED"];
for (const status of expected) assert(MODERN_ACCOUNT_STATUSES.includes(status as never), `Missing modern status: ${status}`);
assert(AccountStatus.PENDING_PAIRING === "PENDING_PAIRING", "Prisma AccountStatus is missing PENDING_PAIRING");

const phones: Record<string, string> = {
  "+905520048107": "905520048107", "905520048107": "905520048107", "05520048107": "905520048107",
  "5520048107": "905520048107", "+90 552 004 81 07": "905520048107", "(0552) 004 81 07": "905520048107",
};
for (const [input, output] of Object.entries(phones)) assert(normalizePhoneNumber(input) === output, `Phone normalization failed: ${input}`);
for (const input of ["", "123", "+00"]) {
  try { normalizePhoneNumber(input); throw new Error(`Invalid phone accepted: ${input}`); } catch (error) {
    assert(error instanceof Error, "Invalid phone did not throw");
  }
}

assertValidTransition(AccountStatus.CREATED, AccountStatus.PENDING_QR);
assertValidTransition(AccountStatus.PENDING_PAIRING, AccountStatus.PAIRING_CODE_READY);
try {
  assertValidTransition(AccountStatus.ARCHIVED, AccountStatus.CONNECTED);
  throw new Error("Invalid archived-to-connected transition accepted");
} catch (error) {
  assert(error instanceof Error, "Invalid transition did not throw");
}

const allowedRawStatusFiles = new Set([
  "src/lib/whatsapp/account-status-machine.ts",
  "src/lib/i18n/status-labels.ts",
  "src/worker/baileys-provider.ts",
  "src/worker/index.ts",
  "src/server/billing/subscription-access.ts",
  "src/server/mobile/whatsapp.ts",
  "src/server/whatsapp/worker-health.ts",
  "src/server/whatsapp/reusable-account.ts",
  "src/server/whatsapp/worker-health.ts",
  "src/components/accounts-stable-page.tsx",
  "src/app/api/accounts/[id]/pairing-code/route.ts",
  "src/app/api/accounts/whatsapp/[id]/status/route.ts",
  "src/app/api/accounts/whatsapp/create-pairing-session/route.ts",
  "src/app/api/mobile/whatsapp/accounts/phone-code/route.ts",
]);
const statusPattern = /"PENDING_PAIRING"/;
for (const file of files(path.join(root, "src"))) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (!/\.(ts|tsx)$/.test(file) || allowedRawStatusFiles.has(relative)) continue;
  const content = readFileSync(file, "utf8");
  assert(!statusPattern.test(content), `Raw PENDING_PAIRING found outside protected mapping: ${relative}`);
}

for (const file of files(path.join(root, "src"))) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (!/\.(ts|tsx)$/.test(file) || relative === "src/lib/whatsapp/session-manager.ts" || relative === "src/worker/baileys-provider.ts") continue;
  const content = readFileSync(file, "utf8");
  assert(!/WHATSAPP_SESSION_DIR|WHATSAPP_SESSION_ROOT|whatsappSessionDirectory|clearWhatsAppSession|rm\(.+recursive/.test(content), `Direct WhatsApp session manipulation found: ${relative}`);
}

const qrRoute = readFileSync(path.join(root, "src/app/api/accounts/whatsapp/create-session/route.ts"), "utf8");
const pairingRoute = readFileSync(path.join(root, "src/app/api/accounts/whatsapp/create-pairing-session/route.ts"), "utf8");
for (const [name, content] of [["QR", qrRoute], ["pairing", pairingRoute]] as const) {
  assert(content.includes("ok: true"), `${name} API does not return structured success JSON`);
  assert(content.includes("requireApiSession"), `${name} API is not authenticated`);
  assert(content.includes("assertSameOrigin"), `${name} API is missing CSRF protection`);
  assert(content.includes("enforceWhatsAppRateLimit"), `${name} API is missing rate limiting`);
}

console.log("WhatsApp regression guard passed.");

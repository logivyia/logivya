import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

function exists(file: string) {
  return existsSync(path.join(root, file));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIncludes(file: string, value: string) {
  assert(read(file).includes(value), `${file} must include ${value}`);
}

function assertNotIncludes(file: string, value: string) {
  assert(!read(file).includes(value), `${file} must not include ${value}`);
}

const stableCoreFiles = [
  "src/lib/whatsapp/session-manager.ts",
  "src/server/whatsapp/session-restore.ts",
  "src/server/whatsapp/account-lock.ts",
  "src/server/whatsapp/sendable-groups.ts",
  "src/server/messages/delivery-pipeline.ts",
  "src/server/messages/delete-for-everyone.ts",
  "src/worker/baileys-provider.ts",
  "src/worker/index.ts",
];

for (const file of stableCoreFiles) {
  assert(exists(file), `${file} is missing`);
}

for (const file of [
  "src/lib/whatsapp/session-manager.ts",
  "src/server/whatsapp/session-restore.ts",
  "src/server/whatsapp/account-lock.ts",
  "src/worker/baileys-provider.ts",
  "src/worker/index.ts",
]) {
  assertIncludes(file, "STABLE WHATSAPP/MESSAGE CORE");
}

const accountLock = read("src/server/whatsapp/account-lock.ts");
for (const marker of [
  "logivya:whatsapp-account-lock",
  "\"PX\"",
  "\"NX\"",
  "WHATSAPP_ACCOUNT_LOCK_TIMEOUT",
  "WA_ACCOUNT_LOCK_ACQUIRED",
  "WA_ACCOUNT_LOCK_RELEASED",
]) {
  assert(accountLock.includes(marker), `Account lock is missing marker: ${marker}`);
}
assert(accountLock.includes("redis.eval(RELEASE_LOCK_SCRIPT"), "Account lock must release only its own token.");

const worker = read("src/worker/index.ts");
for (const marker of [
  "withWhatsAppAccountLock",
  "worker:${action}",
  "message-send",
  "message-delete-for-everyone",
  "WHATSAPP_ACCOUNT_LOCK_TIMEOUT",
  "WHATSAPP_SESSION_RECOVERY_INTERVAL_MS",
  "whatsapp.session.recovery_skipped_no_restorable_credentials",
  "WHATSAPP_TRANSIENT_DISCONNECT",
  "MESSAGE_JOB_TENANT_MISMATCH",
  "MESSAGE_JOB_OWNERSHIP_MISMATCH",
]) {
  assert(worker.includes(marker), `Worker stable-core contract is missing marker: ${marker}`);
}
assert(!worker.includes('data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_CREDENTIALS_MISSING" },'), "Worker periodic recovery must not mark credentials missing without an operation failure.");

const restoreHelper = read("src/server/whatsapp/session-restore.ts");
assertIncludes("src/server/whatsapp/session-restore.ts", "WA_RESTORE_SKIPPED_NO_RESTORABLE_SESSION");
assertIncludes("src/server/whatsapp/session-restore.ts", "status: AccountStatus.CONNECTING");
assertNotIncludes("src/server/whatsapp/session-restore.ts", "WA_AUTH_REQUIRED_CONFIRMED");
assertNotIncludes("src/server/whatsapp/session-restore.ts", 'lastError: "WHATSAPP_CREDENTIALS_MISSING"');
assert(restoreHelper.includes("isFatalWhatsAppSessionError"), "Restore helper must preserve explicit fatal auth checks.");

for (const route of ["src/app/api/auth/logout/route.ts", "src/app/api/mobile/auth/logout/route.ts"]) {
  const source = read(route);
  for (const forbidden of ["clearWhatsAppSession", "logoutWhatsApp", "disconnectWhatsApp", "provider.disconnect"]) {
    assert(!source.includes(forbidden), `${route} must not call ${forbidden} during app logout.`);
  }
}

const sendableGroups = read("src/server/whatsapp/sendable-groups.ts");
for (const marker of ["companyId", "userId: scope.userId", "accountId: scope.accountId", "archivedAt: null"]) {
  assert(sendableGroups.includes(marker), `Sendable group isolation is missing marker: ${marker}`);
}

const deliveryPipeline = read("src/server/messages/delivery-pipeline.ts");
for (const marker of [
  "resolveCurrentWhatsAppAccount",
  "resolveSendableWhatsAppGroups(actor.companyId, requestedIds, { userId: actor.userId, accountId: currentAccount.id })",
  "createMessageCorrelationId()",
]) {
  assert(deliveryPipeline.includes(marker), `Delivery pipeline is missing stable marker: ${marker}`);
}
assert(!/isAuthorizedLogivyaPlatformAdmin|requirePlatformAdmin|burakidim@gmail\.com/i.test(deliveryPipeline), "Message delivery must not depend on platform-admin identity.");

const deleteForEveryone = read("src/server/messages/delete-for-everyone.ts");
for (const marker of ["recipient.account.userId !== input.userId", "recipient.group?.userId !== input.userId", "queue.add(\"delete-for-everyone\""]) {
  assert(deleteForEveryone.includes(marker), `Delete for Everyone isolation is missing marker: ${marker}`);
}

console.log("Stable WhatsApp/message core contract checks passed.");

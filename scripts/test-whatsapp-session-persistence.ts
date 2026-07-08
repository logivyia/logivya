import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sessionManager = read("src/lib/whatsapp/session-manager.ts");
assert(sessionManager.includes("STABLE WHATSAPP/MESSAGE CORE"), "Session manager must carry the stable-core warning.");
assert(sessionManager.includes("backupWhatsAppSessionToDatabase"), "Session manager must persist WhatsApp credentials to the database.");
assert(sessionManager.includes("restoreWhatsAppSessionFromDatabase"), "Session manager must restore WhatsApp credentials from the database.");
assert(sessionManager.includes("clearWhatsAppSession"), "Session manager must keep explicit session clearing isolated.");
const clearSessionBlock = sessionManager.slice(sessionManager.indexOf("export async function clearWhatsAppSession"));
assert(clearSessionBlock.includes("sessionSnapshotAt: null"), "Clearing a WhatsApp session must also clear stale account sessionSnapshotAt.");
assert(clearSessionBlock.includes("sessionRestoredAt: null"), "Clearing a WhatsApp session must also clear stale account sessionRestoredAt.");
assert(sessionManager.includes("WA_SESSION_SNAPSHOT_SAVE_START"), "Session snapshots must emit a start marker.");
assert(sessionManager.includes("WA_SESSION_SNAPSHOT_SAVE_SUCCESS"), "Session snapshots must emit a success marker.");
assert(sessionManager.includes("WA_SESSION_SNAPSHOT_SAVE_FAILED"), "Session snapshots must emit a failure marker.");
assert(sessionManager.includes("WA_RESTORE_START"), "Session restore must emit a start marker.");
assert(sessionManager.includes("WA_RESTORE_SUCCESS"), "Session restore must emit a success marker.");
assert(sessionManager.includes("WA_RESTORE_FAILED"), "Session restore must emit a failure marker.");
assert(sessionManager.includes("WA_SESSION_SNAPSHOT_STALE_METADATA_CLEARED"), "Missing session snapshots must self-heal stale account metadata.");
assert(sessionManager.includes("OR: [{ sessionSnapshotAt: { not: null } }, { sessionRestoredAt: { not: null } }]"), "Stale snapshot self-healing must not write on every restore probe.");

const provider = read("src/worker/baileys-provider.ts");
assert(provider.includes("STABLE WHATSAPP/MESSAGE CORE"), "Baileys provider must carry the stable-core warning.");
for (const marker of [
  "backupWhatsAppSessionToDatabase(accountId, \"creds.update\")",
  "backupWhatsAppSessionToDatabase(accountId, \"connection.open\")",
  "backupWhatsAppSessionToDatabase(input.accountId, \"message.sent\")",
  "backupWhatsAppSessionToDatabase(input.accountId, \"message.deleted\")",
  "restoreWhatsAppSessionFromDatabase(accountId)",
  "restoreWhatsAppSessionFromDatabase(input.accountId)",
  "DisconnectReason.loggedOut",
  "WHATSAPP_TRANSIENT_DISCONNECT",
]) {
  assert(provider.includes(marker), `Baileys provider is missing persistence marker: ${marker}`);
}
assert(provider.indexOf("const loggedOut = code === DisconnectReason.loggedOut") < provider.indexOf("if (loggedOut)"), "Logged-out handling must be explicit before session clearing.");
assert(provider.includes("markTransientConnectionLoss"), "Transient disconnect must remain recoverable through the self-healing path.");
assert(provider.includes("status: \"CONNECTING\"") && provider.includes("lastError: \"WHATSAPP_TRANSIENT_DISCONNECT\""), "Transient disconnect must not become a fresh-pairing requirement.");
assert(provider.includes("intentionallyStoppedSockets = new WeakSet"), "Intentional socket stops must be tracked per socket instance, not per account.");
for (const marker of [
  "WA_PAIRING_START",
  "WA_PAIRING_CODE_GENERATED",
  "WA_PAIRING_CONNECTION_UPDATE",
  "WA_PAIRING_CREDS_RECEIVED",
  "WA_ACCOUNT_CONNECTED",
  "WA_GROUP_SYNC_START",
  "WA_GROUP_SYNC_SUCCESS",
]) {
  assert(provider.includes(marker), `Baileys provider must emit structured marker: ${marker}`);
}

const pairingFlow = read("src/server/whatsapp/pairing-code-flow.ts");
for (const marker of [
  "STABLE WHATSAPP/MESSAGE CORE",
  "withWhatsAppAccountLock",
  "hasReusableCode",
  "hasInFlightPairing",
  "PAIRING_CODE_MIN_TTL_MS",
  "PAIRING_IN_FLIGHT_MS",
  "WA_PAIRING_CODE_REUSED",
  "WA_PAIRING_IN_FLIGHT_REUSED",
]) {
  assert(pairingFlow.includes(marker), `Pairing code flow is missing idempotency marker: ${marker}`);
}
for (const route of [
  "src/app/api/accounts/whatsapp/create-pairing-session/route.ts",
  "src/app/api/accounts/[id]/pairing-code/route.ts",
  "src/app/api/mobile/whatsapp/accounts/phone-code/route.ts",
]) {
  const source = read(route);
  assert(source.includes("requestPhonePairingCode"), `${route} must use the centralized idempotent pairing flow.`);
  assert(!source.includes("enqueueWhatsAppJob(\"pairing\""), `${route} must not enqueue duplicate pairing jobs directly.`);
}

const worker = read("src/worker/index.ts");
assert(worker.includes("STABLE WHATSAPP/MESSAGE CORE"), "Worker must carry the stable-core warning.");
assert(worker.includes("recoverSessions"), "Worker must recover sessions on startup.");
assert(worker.includes("WHATSAPP_SESSION_RECOVERY_INTERVAL_MS"), "Worker must periodically re-run session recovery.");
assert(worker.includes("restoreWhatsAppSessionFromDatabase(account.id)"), "Worker startup recovery must restore DB-backed WhatsApp sessions.");
assert(worker.includes("hasRestorableWhatsAppCredentials(accountId)"), "Worker failures must distinguish restorable sessions from true auth loss.");
assert(worker.includes("whatsapp.session.recovery_skipped_no_restorable_credentials"), "Worker must not silently convert read-side missing credentials into auth-required state.");

const restoreHelper = read("src/server/whatsapp/session-restore.ts");
assert(restoreHelper.includes("STABLE WHATSAPP/MESSAGE CORE"), "On-demand restore helper must carry the stable-core warning.");
for (const marker of [
  "hasRestorableWhatsAppCredentials",
  "WA_SOCKET_MISSING_RESTORE_ATTEMPT",
  "WA_RECONNECT_SCHEDULED",
  "WA_RESTORE_SKIPPED_NO_RESTORABLE_SESSION",
  "AccountStatus.CONNECTED",
  "AccountStatus.DISCONNECTED",
  "AccountStatus.RECONNECT_REQUIRED",
  "AccountStatus.FAILED",
  "AccountStatus.ERROR",
  "status: AccountStatus.CONNECTING",
  "lastError: null",
  "enqueueWhatsAppJob",
]) {
  assert(restoreHelper.includes(marker), `On-demand restore helper is missing marker: ${marker}`);
}
assert(!restoreHelper.includes("WA_AUTH_REQUIRED_CONFIRMED"), "Read-side restore must not emit auth-required confirmed markers.");
assert(!restoreHelper.includes('lastError: "WHATSAPP_CREDENTIALS_MISSING"'), "Read-side restore must not write WHATSAPP_CREDENTIALS_MISSING.");

for (const route of [
  "src/app/api/accounts/route.ts",
  "src/app/api/accounts/whatsapp/[id]/status/route.ts",
  "src/app/api/accounts/whatsapp/[id]/sync-groups/route.ts",
  "src/app/api/mobile/bootstrap/route.ts",
  "src/app/api/mobile/whatsapp/status/route.ts",
  "src/app/api/mobile/whatsapp/accounts/route.ts",
  "src/app/api/mobile/whatsapp/accounts/[id]/status/route.ts",
  "src/app/api/platform/route.ts",
]) {
  assert(read(route).includes("requestWhatsAppSessionRestore"), `${route} must trigger on-demand session restore.`);
}

const webStatusRoute = read("src/app/api/accounts/whatsapp/[id]/status/route.ts");
assert(webStatusRoute.includes("canShowQr"), "Web status route must not show stale QR while a restorable session is being restored.");
assert(webStatusRoute.includes("[\"PENDING_QR\", \"QR_READY\"].includes(account.status)"), "QR display must be limited to QR pairing states.");

for (const logoutRoute of ["src/app/api/auth/logout/route.ts", "src/app/api/mobile/auth/logout/route.ts"]) {
  const source = read(logoutRoute);
  assert(!source.includes("clearWhatsAppSession"), `${logoutRoute} must not clear WhatsApp sessions during app logout.`);
  assert(!source.includes("logoutWhatsApp"), `${logoutRoute} must not log out WhatsApp during app logout.`);
}

const mobileStatus = read("src/server/mobile/whatsapp.ts");
assert(mobileStatus.includes("WHATSAPP_TRANSIENT_DISCONNECT"), "Mobile status serialization must treat transient disconnect as reconnecting.");
assert(mobileStatus.includes("return \"RECONNECTING\""), "Mobile status serialization must expose reconnecting state.");

console.log("WhatsApp session persistence regression guard passed.");

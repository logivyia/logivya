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
assert(sessionManager.includes("credentials_not_registered"), "Unregistered pairing credentials must not be persisted as restorable session snapshots.");

const pairingGuard = read("src/server/whatsapp/pairing-guard.ts");
for (const marker of [
  "hasActivePhonePairing",
  "PAIRING_CODE_READY",
  "PENDING_PAIRING",
  "WHATSAPP_PHONE_PAIRING_GUARD_MS",
]) {
  assert(pairingGuard.includes(marker), `Phone pairing guard is missing marker: ${marker}`);
}

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
assert(provider.includes("whatsapp.reconnect.skipped_active_pairing"), "Reconnect must not interrupt an active phone pairing code.");
assert(provider.includes("WHATSAPP_PAIRING_IN_PROGRESS"), "Message/reconnect recovery must treat active phone pairing as recoverable in-progress state.");
assert(!provider.includes('if (currentMode === "PAIR_PHONE") settleInitialized();'), "Phone pairing must not request a code immediately on the connecting event.");
for (const marker of [
  "WA_PAIRING_START",
  "WA_PAIRING_CODE_GENERATED",
  "WA_PAIRING_CONNECTION_UPDATE",
  "WA_PAIRING_CREDS_RECEIVED",
  "WHATSAPP_PAIRING_RETRY_SCHEDULED",
  "whatsapp.pairing.code_request_retry_scheduled",
  "PAIRING_CODE_TTL_MS",
  "PHONE_PAIRING_QR_REF_TIMEOUT_MS",
  "qrTimeout: PHONE_PAIRING_QR_REF_TIMEOUT_MS",
  "whatsapp.pairing.same_code_refreshed",
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
  "PAIRING_CODE_STABILITY_MS",
  "PAIRING_IN_FLIGHT_MS",
  "hasExpiringPairingCode",
  "WA_PAIRING_CODE_REUSED",
  "WA_PAIRING_IN_FLIGHT_REUSED",
  "pairing-refresh",
  "refreshRequestedAt",
]) {
  assert(pairingFlow.includes(marker), `Pairing code flow is missing idempotency marker: ${marker}`);
}
const pairingCodeState = read("src/server/whatsapp/pairing-code-state.ts");
for (const marker of [
  "canExposePhonePairingCode",
  "AccountStatus.PAIRING_CODE_READY",
  "account.lastError",
  "visiblePhonePairingCode",
]) {
  assert(pairingCodeState.includes(marker), `Pairing code state helper is missing stale-code guard marker: ${marker}`);
}
assert(pairingFlow.includes("canExposePhonePairingCode(account, phoneNumber, PAIRING_CODE_MIN_TTL_MS)") && pairingFlow.includes("Date.now() - account.updatedAt.getTime() >= PAIRING_CODE_STABILITY_MS"), "Pairing flow must not reuse stale or just-invalidated codes from disconnected or failed accounts.");
const workerHealth = read("src/server/whatsapp/worker-health.ts");
assert(workerHealth.includes("canExposePhonePairingCode(account, undefined, PAIRING_CODE_MIN_TTL_MS)"), "Pairing wait loop must only return display-safe phone pairing codes with enough remaining TTL.");
assert(workerHealth.includes("PAIRING_CODE_STABILITY_MS") && workerHealth.includes("stableAccount.pairingCode === firstCode"), "Pairing wait loop must verify a code remains stable before returning it to users.");
assert(workerHealth.includes("updatedAfter") && workerHealth.includes("stableAccount.updatedAt.getTime() > options.updatedAfter.getTime()"), "Pairing wait loop must wait for worker-side refresh before returning a reused code.");
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
assert(worker.includes("whatsapp.worker.reconnect.skipped_active_pairing"), "Worker must skip stale reconnect jobs while phone pairing is active.");
assert(worker.includes("whatsapp.worker.reconnect.skipped_stale_connected_job"), "Worker must skip reconnect jobs that were queued before a newer successful connection state.");
assert(worker.includes("whatsapp.worker.pairing_retry_scheduled"), "Worker must not mark recoverable phone pairing socket closes as failed.");
assert(worker.includes("return await provider.requestPairingCode"), "Worker must await pairing provider calls so retry-scheduled errors are caught instead of retried by BullMQ.");
assert(worker.includes('action === "pairing-refresh"') && worker.includes("return await provider.refreshPairingCode"), "Worker must re-register reused phone pairing codes on a live socket before API returns them.");

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
  "hasActivePhonePairing",
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
assert(webStatusRoute.includes("visiblePhonePairingCode"), "Web status route must not expose stale phone pairing codes.");

for (const logoutRoute of ["src/app/api/auth/logout/route.ts", "src/app/api/mobile/auth/logout/route.ts"]) {
  const source = read(logoutRoute);
  assert(!source.includes("clearWhatsAppSession"), `${logoutRoute} must not clear WhatsApp sessions during app logout.`);
  assert(!source.includes("logoutWhatsApp"), `${logoutRoute} must not log out WhatsApp during app logout.`);
}

const mobileStatus = read("src/server/mobile/whatsapp.ts");
assert(mobileStatus.includes("WHATSAPP_TRANSIENT_DISCONNECT"), "Mobile status serialization must treat transient disconnect as reconnecting.");
assert(mobileStatus.includes("return \"RECONNECTING\""), "Mobile status serialization must expose reconnecting state.");
assert(mobileStatus.includes("visiblePhonePairingCode"), "Mobile status serialization must not expose stale phone pairing codes.");

console.log("WhatsApp session persistence regression guard passed.");

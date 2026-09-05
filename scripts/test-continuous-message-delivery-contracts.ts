import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sliceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0, `Missing start marker: ${start}`);
  assert(endIndex > startIndex, `Missing end marker after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

const provider = read("src/worker/baileys-provider.ts");
const worker = read("src/worker/index.ts");
const mobileStatus = read("src/server/mobile/whatsapp.ts");
const accountStatus = read("src/lib/whatsapp/account-status-machine.ts");

for (const marker of [
  "const intentionallyStoppedSockets = new WeakSet<WASocket>()",
  "private async keepAliveSocket",
  "markOnlineOnConnect: false",
  "private async markTransientConnectionLoss",
  "private async handleMissingCredentials",
  "MISSING_CREDENTIALS_GRACE_ATTEMPTS",
]) {
  assert(provider.includes(marker), `Continuous delivery provider contract missing: ${marker}`);
}

const keepAliveBlock = sliceBetween(provider, "private async keepAliveSocket", "private startHeartbeat");
assert(keepAliveBlock.includes("socket.ws.isOpen"), "Heartbeat health must use the underlying WebSocket state.");
assert(!keepAliveBlock.includes("sendPresenceUpdate"), "Heartbeat must not advertise active presence and suppress primary-phone notifications.");
assert(!provider.includes('sendPresenceUpdate("available")'), "Stable worker must never force the linked account into active presence.");

const sendBlock = sliceBetween(provider, "async sendGroupMessage", "async deleteGroupMessage");
assert(sendBlock.indexOf("sockets.get(input.accountId)?.user") < sendBlock.indexOf("hasRestorableWhatsAppCredentials(input.accountId)"), "Message send must check the live socket before DB credential restore checks.");
assert(sendBlock.includes("this.markTransientConnectionLoss(input.accountId"), "Message send failures must enter transient self-healing.");
assert(sendBlock.includes("this.scheduleReconnect(input.accountId"), "Message send failures must schedule reconnect.");
assert(!sendBlock.includes('data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_CREDENTIALS_MISSING"'), "Message send must not directly convert transient state into auth-required.");

const deleteStart = provider.indexOf("async deleteGroupMessage");
assert(deleteStart >= 0, "Missing deleteGroupMessage block.");
const deleteBlock = provider.slice(deleteStart);
assert(deleteBlock.includes("sockets.get(input.accountId)?.user"), "Delete for Everyone must also prefer the live socket.");
assert(deleteBlock.includes("this.markTransientConnectionLoss(input.accountId"), "Delete for Everyone failures must enter transient self-healing.");
assert(deleteBlock.includes("this.scheduleReconnect(input.accountId"), "Delete for Everyone failures must schedule reconnect.");

const closeBlock = sliceBetween(provider, 'if (connection === "close")', "} catch (error) {");
assert(closeBlock.includes("intentionallyStoppedSockets.has(socket)"), "Socket close handling must classify intentional stops per socket instance.");
assert(closeBlock.includes("this.markTransientConnectionLoss(accountId"), "Recoverable socket close must stay transient.");
assert(!closeBlock.includes("state.creds.registered ? \"DISCONNECTED\" : \"RECONNECT_REQUIRED\""), "Recoverable close must not fall back to reconnect-required based on a transient creds read.");
assert(closeBlock.includes("const loggedOut = isLoggedOutError(lastDisconnect?.error)"), "Socket close handling must use the shared terminal-auth classifier.");
assert(closeBlock.includes('if (!connectionOpened && currentMode === "PAIR_PHONE")'), "Phone-pairing recovery must end after the socket has opened successfully.");
assert(closeBlock.includes('if (!connectionOpened && currentMode === "PAIR_QR")'), "QR-pairing recovery must end after the socket has opened successfully.");

const credsUpdateBlock = sliceBetween(provider, 'socket.ev.on("creds.update"', "const runtimeKeys");
assert(credsUpdateBlock.includes('if (!connectionOpened && activeMode === "PAIR_PHONE" && state.creds.registered)'), "Registered pairing watchdogs must only run before the first connection open.");
assert(credsUpdateBlock.includes('if (!connectionOpened && (activeMode === "PAIR_PHONE" || activeMode === "PAIR_QR"))'), "Post-open credential rotations must not be audited as active pairing.");

const socketConfigBlock = sliceBetween(provider, "const socket = makeWASocket", "if (sessionGenerations.get(accountId) !== generation)");
assert(socketConfigBlock.includes("syncFullHistory: syncContactHistory"), "Socket history behavior must use the guarded sync policy.");
assert(socketConfigBlock.includes("shouldSyncHistoryMessage: () => false"), "Worker sockets must reject unsolicited full-history processing.");
assert(provider.includes("const syncContactHistory = false"), "Primary-phone history sync must stay disabled for pairing and reconnect modes.");

const terminalAuthBlock = sliceBetween(provider, "function isLoggedOutError", "function canReissueActivePairingCodeAfterClose");
assert(terminalAuthBlock.includes("DisconnectReason.loggedOut"), "Explicit logout must remain a terminal auth failure.");
assert(terminalAuthBlock.includes("DisconnectReason.forbidden"), "WhatsApp 403/forbidden must stop reconnect loops and require fresh pairing.");

assert(worker.includes("WHATSAPP_TRANSIENT_DISCONNECT"), "Worker must classify transient disconnect as recoverable.");
assert(worker.includes("WHATSAPP_RESTORING_CONNECTION"), "Worker must keep final recoverable send attempts in restoring state.");
assert(worker.includes("delete-reconnect-${recipient.accountId}"), "Delete for Everyone recoverable failures must enqueue reconnect.");

assert(mobileStatus.includes('lastError === "WHATSAPP_CREDENTIALS_MISSING") return "RECONNECTING"'), "Mobile status must not show auth-required for recoverable credential-missing state.");
assert(accountStatus.includes('if (lastError === "WHATSAPP_LOGGED_OUT") return false;'), "Recoverable account status must only treat explicit logout as fatal.");
assert(!accountStatus.includes('lastError === "WHATSAPP_LOGGED_OUT" || lastError === "WHATSAPP_CREDENTIALS_MISSING"'), "Credential-missing must not be globally fatal.");

assert(provider.includes("const reconnectScheduling = new Set<string>();"), "Reconnect scheduling must reserve each account before asynchronous database reads.");
assert(provider.includes("reconnectTimers.has(accountId) || reconnectScheduling.has(accountId)"), "Reconnect scheduling must collapse concurrent callbacks for the same account.");
assert(provider.includes('["WHATSAPP_LOGGED_OUT", "WHATSAPP_CREDENTIALS_MISSING"].includes(account.lastError ?? "")'), "Reconnect scheduling must stop after terminal credential loss.");

console.log("Continuous WhatsApp message delivery contracts passed.");

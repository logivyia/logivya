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
  "socket.sendPresenceUpdate(\"available\")",
  "private async markTransientConnectionLoss",
  "private async handleMissingCredentials",
  "MISSING_CREDENTIALS_GRACE_ATTEMPTS",
]) {
  assert(provider.includes(marker), `Continuous delivery provider contract missing: ${marker}`);
}

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

assert(worker.includes("WHATSAPP_TRANSIENT_DISCONNECT"), "Worker must classify transient disconnect as recoverable.");
assert(worker.includes("WHATSAPP_RESTORING_CONNECTION"), "Worker must keep final recoverable send attempts in restoring state.");
assert(worker.includes("delete-reconnect-${recipient.accountId}"), "Delete for Everyone recoverable failures must enqueue reconnect.");

assert(mobileStatus.includes('lastError === "WHATSAPP_CREDENTIALS_MISSING") return "RECONNECTING"'), "Mobile status must not show auth-required for recoverable credential-missing state.");
assert(accountStatus.includes('if (lastError === "WHATSAPP_LOGGED_OUT") return false;'), "Recoverable account status must only treat explicit logout as fatal.");
assert(!accountStatus.includes('lastError === "WHATSAPP_LOGGED_OUT" || lastError === "WHATSAPP_CREDENTIALS_MISSING"'), "Credential-missing must not be globally fatal.");

console.log("Continuous WhatsApp message delivery contracts passed.");

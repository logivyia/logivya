import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const pipeline = read("src/server/messages/delivery-pipeline.ts");
assert(pipeline.includes("createMessageCorrelationId()"), "Message pipeline must create correlation IDs.");
assert(pipeline.includes("assertMessageDeliveryQueueReady"), "Message pipeline must reject new campaigns when the delivery queue has no consumer.");
assert(pipeline.includes("resolveCurrentWhatsAppAccount"), "Message pipeline must resolve the current scoped WhatsApp account.");
assert(pipeline.includes("resolveSendableWhatsAppGroups(actor.companyId, requestedIds, { userId: actor.userId, accountId: currentAccount.id })"), "Message pipeline must resolve groups by actor and current account scope.");
assert(!/isAuthorizedLogivyaPlatformAdmin|requirePlatformAdmin|burakidim@gmail\.com/i.test(pipeline), "Message pipeline must not depend on platform admin state.");

const webRoute = read("src/app/api/campaigns/route.ts");
const mobileHelper = read("src/server/mobile/messages.ts");
assert(webRoute.includes("createMessageDeliveryCampaign"), "Web campaign route must use the shared message pipeline.");
assert(mobileHelper.includes("createMessageDeliveryCampaign"), "Mobile message helper must use the shared message pipeline.");

const contracts = read("src/server/queues/contracts.ts");
assert(contracts.includes("correlationId: string"), "Message queue contract must include correlationId.");
assert(contracts.includes("recoveryRetry?: boolean"), "Message queue contract must support recoverable retry payloads.");

const worker = read("src/worker/index.ts");
for (const value of [
  "MESSAGE_JOB_COMPANY_MISMATCH",
  "MESSAGE_JOB_CAMPAIGN_MISMATCH",
  "MESSAGE_JOB_TENANT_MISMATCH",
  "MESSAGE_JOB_OWNERSHIP_MISMATCH",
  "message.recurring.group_resolution_failed",
  "readCampaignCorrelationId",
  "withWhatsAppAccountLock",
  "WHATSAPP_ACCOUNT_LOCK_TIMEOUT",
  "provider.sendGroupMessage",
  "message.target_resolution_failed",
  "isPermanentMessageDeliveryError",
  "updateMessageCampaignDeliveryAggregate",
  "correlationId",
]) {
  assert(worker.includes(value), `Worker is missing message delivery guard/log marker: ${value}`);
}

const provider = read("src/worker/baileys-provider.ts");
assert(provider.includes("message.baileys.send.attempt"), "Baileys provider must log send attempts.");
assert(provider.includes("message.baileys.send.failed"), "Baileys provider must log send failures.");
assert(provider.includes("message.baileys.send.succeeded"), "Baileys provider must log send success.");

const sendableGroups = read("src/server/whatsapp/sendable-groups.ts");
assert(sendableGroups.includes("userId: scope.userId"), "Sendable group resolution must enforce user scope.");
assert(sendableGroups.includes("accountId: scope.accountId"), "Sendable group resolution must enforce account scope.");

const mobileClient = read("apps/mobile/src/api/client.ts");
const genericForbiddenIndex = mobileClient.indexOf('status === 403) return translateCurrent("operationForbiddenError")');
const staleMobileAccessIndex = mobileClient.indexOf("mobil eri");
assert(genericForbiddenIndex >= 0, "Mobile client must map generic 403 responses to the localized permission message.");
assert(staleMobileAccessIndex < 0 || genericForbiddenIndex < staleMobileAccessIndex, "Generic 403 mapping must run before the stale mobile access message.");

for (const route of [
  "src/app/api/messages/campaigns/route.ts",
  "src/app/api/messages/campaigns/[id]/route.ts",
  "src/app/api/mobile/messages/history/route.ts",
  "src/app/api/mobile/messages/history/[id]/route.ts",
  "src/app/api/messages/campaigns/[id]/recipients/route.ts",
]) {
  assert(read(route).includes("createdById: user.id"), `${route} must scope normal message history to the current user.`);
}

console.log("Message delivery pipeline regression guard passed.");

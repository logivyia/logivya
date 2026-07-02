import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source: string, needle: string, label: string) {
  assert(source.includes(needle), `${label}: missing ${needle}`);
}

function assertNotMatches(source: string, pattern: RegExp, label: string) {
  assert(!pattern.test(source), `${label}: forbidden pattern ${pattern}`);
}

const deliveryPipeline = read("src/server/messages/delivery-pipeline.ts");
const subscriptionAccess = read("src/server/billing/subscription-access.ts");
const sendableGroups = read("src/server/whatsapp/sendable-groups.ts");
const worker = read("src/worker/index.ts");
const provider = read("src/worker/baileys-provider.ts");
const sessionManager = read("src/lib/whatsapp/session-manager.ts");
const workerHealth = read("src/server/whatsapp/worker-health.ts");
const accountsStablePage = read("src/components/accounts-stable-page.tsx");
const whatsAppRequestGuards = read("src/server/whatsapp/request-guards.ts");
const webCampaignRoute = read("src/app/api/campaigns/route.ts");
const mobileSendRoute = read("src/app/api/mobile/messages/send/route.ts");
const mobileScheduleRoute = read("src/app/api/mobile/messages/schedule/route.ts");
const mobileQrRoute = read("src/app/api/mobile/whatsapp/accounts/qr/route.ts");
const mobilePhoneCodeRoute = read("src/app/api/mobile/whatsapp/accounts/phone-code/route.ts");
const platformRoute = read("src/app/api/platform/route.ts");
const mobileGroupsRoute = read("src/app/api/mobile/groups/route.ts");

assertIncludes(webCampaignRoute, "createMessageDeliveryCampaign", "web campaign route");
assertIncludes(mobileSendRoute, "createMobileMessageCampaign", "mobile send route");
assertIncludes(mobileScheduleRoute, "createMobileMessageCampaign", "mobile schedule route");

assertIncludes(deliveryPipeline, 'traceMessageStage("auth.permission"', "delivery tracing");
assertIncludes(deliveryPipeline, 'traceMessageStage("subscription.message_access"', "delivery tracing");
assertIncludes(deliveryPipeline, 'traceMessageStage("queue.recipients.enqueue"', "delivery tracing");
assertIncludes(deliveryPipeline, "message.queue.recipient.enqueued", "queue observability");
assertIncludes(deliveryPipeline, "subscriptionAccess.canSendMessage", "shared subscription access");
assertIncludes(deliveryPipeline, "resolveSendableWhatsAppGroups", "shared group resolver");
assertNotMatches(deliveryPipeline, /maxMessagesPerDay|maxMessagesPerMonth|maxGroups|dailyMessageLimit|monthlyMessageLimit/, "delivery pipeline");

assertIncludes(subscriptionAccess, "return { allowed: true, limit: undefined", "message limits disabled");
assertIncludes(subscriptionAccess, "return { allowed: true, reason: undefined, limit: undefined, used: 0 }", "whatsapp account limit disabled");
assertNotMatches(subscriptionAccess, /canConnectWhatsAppAccount[\s\S]{0,800}whatsAppAccount\.count/, "whatsapp account connect access");
assertNotMatches(subscriptionAccess, /canConnectWhatsAppAccount[\s\S]{0,800}accounts\.planLimit/, "whatsapp account connect access");
assertNotMatches(subscriptionAccess, /canSendMessage[\s\S]*maxMessagesPerDay|canSendMessage[\s\S]*maxMessagesPerMonth|canSendMessage[\s\S]*maxGroups/, "subscription send access");
assertNotMatches(subscriptionAccess, /canUseScheduledMessages[\s\S]{0,200}plan\.hasScheduledMessages/, "scheduled feature gate");
assertNotMatches(subscriptionAccess, /canUseRecurringMessages[\s\S]{0,200}plan\.hasRecurringMessages/, "recurring feature gate");

assertIncludes(sendableGroups, "isRecoverableWhatsAppStatus", "sendable group resolver");
assertNotMatches(sendableGroups, /canSend:\s*true[^}]*\}/, "sendable group query hard blocker");
assertIncludes(provider, "groupsOwnershipRepairedCount", "group sync ownership repair telemetry");
assertIncludes(provider, "{ userId: ownerUserId, companyId: account.companyId }", "group sync ownership repair");
assertIncludes(provider, 'throw new Error("WHATSAPP_ACCOUNT_OWNER_MISSING")', "group sync owner guard");
assertIncludes(provider, "whatsapp.qr.connection_closed_after_ready", "QR mode must not be overwritten by reconnect-required close handling");
assertIncludes(provider, "whatsapp.qr.transient_close_retry_scheduled", "QR mode must retry transient socket closes before failing");
assertIncludes(provider, "whatsapp.qr.error_after_ready_ignored", "QR mode must preserve QR_READY after late handler errors");
assertIncludes(provider, "whatsapp.pairing.stale_socket_close_ignored", "phone pairing must ignore stale socket closes after a newer code request");
assertIncludes(provider, "whatsapp.pairing.connection_closed_after_code_preserved", "phone pairing must preserve active code after transient socket closes");
assertIncludes(provider, "whatsapp.pairing.error_after_code_ignored", "phone pairing must not overwrite PAIRING_CODE_READY after late handler errors");
assertIncludes(sessionManager, "snapshotHasRegisteredCredentials", "session snapshots must distinguish partial pairing credentials from registered sessions");
assertIncludes(sessionManager, "registered ? AccountStatus.CONNECTED : AccountStatus.PENDING_PAIRING", "partial pairing credentials must not be stored as connected sessions");
assertIncludes(workerHealth, "whatsAppSession.findUnique", "QR wait must fall back to worker session QR");
assertIncludes(accountsStablePage, "/api/accounts/whatsapp/${modal.accountId}/status", "accounts modal must poll the scoped WhatsApp status route");
assertIncludes(accountsStablePage, "src={visibleQr}", "accounts modal must render backend QR image directly");
assertNotMatches(accountsStablePage, /api\.qrserver\.com/, "accounts modal must not send QR data to third-party renderers");
assertIncludes(whatsAppRequestGuards, "async function readyClient", "WhatsApp request guards must wait for Redis before rate-limit commands");
assertIncludes(whatsAppRequestGuards, "const redisClient = await readyClient()", "WhatsApp rate-limit guard must not issue Redis commands before ready");

assertIncludes(worker, 'traceMessageStage("worker.target.resolve"', "worker target tracing");
assertIncludes(worker, 'traceMessageStage("worker.baileys.send"', "worker send tracing");
assertIncludes(worker, "MESSAGE_JOB_TENANT_MISMATCH", "worker tenant protection");
assertIncludes(worker, "MESSAGE_JOB_OWNERSHIP_MISMATCH", "worker user/account ownership protection");
assertIncludes(worker, "message.recurring.group_resolution_failed", "recurring ownership revalidation");
assertIncludes(worker, "WHATSAPP_RESTORING_CONNECTION", "worker recoverable retry");

assertIncludes(mobileQrRoute, 'status: "CONNECTED"', "mobile QR connected-account reuse");
assertIncludes(mobilePhoneCodeRoute, 'status: "CONNECTED"', "mobile phone-code connected-account reuse");
assertIncludes(platformRoute, "isRecoverableWhatsAppStatus", "web platform group filtering");
assertIncludes(mobileGroupsRoute, "isRecoverableWhatsAppStatus", "mobile group filtering");

console.info("message delivery root-cause regression checks passed");

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
const pairingFlow = read("src/server/whatsapp/pairing-code-flow.ts");
const accountsStablePage = read("src/components/accounts-stable-page.tsx");
const whatsAppRequestGuards = read("src/server/whatsapp/request-guards.ts");
const webCampaignRoute = read("src/app/api/campaigns/route.ts");
const mobileSendRoute = read("src/app/api/mobile/messages/send/route.ts");
const mobileScheduleRoute = read("src/app/api/mobile/messages/schedule/route.ts");
const mobileQrRoute = read("src/app/api/mobile/whatsapp/accounts/qr/route.ts");
const mobilePhoneCodeRoute = read("src/app/api/mobile/whatsapp/accounts/phone-code/route.ts");
const webQrRoute = read("src/app/api/accounts/whatsapp/create-session/route.ts");
const regenerateQrRoute = read("src/app/api/accounts/whatsapp/[id]/regenerate-qr/route.ts");
const platformRoute = read("src/app/api/platform/route.ts");
const mobileGroupsRoute = read("src/app/api/mobile/groups/route.ts");
const mobileResponse = read("src/server/mobile/response.ts");
const mobileApiClient = read("apps/mobile/src/api/client.ts");
const packageManifest = read("package.json");
const workerDockerfile = read("Dockerfile.worker");
const productionWorkerDockerfile = read("ops/vps/Dockerfile.worker");
const offlineBatchPatch = read("scripts/patch-baileys-disable-offline-batch.mjs");

assertIncludes(webCampaignRoute, "createMessageDeliveryCampaign", "web campaign route");
assertIncludes(mobileSendRoute, "createMobileMessageCampaign", "mobile send route");
assertIncludes(mobileScheduleRoute, "createMobileMessageCampaign", "mobile schedule route");

assertIncludes(deliveryPipeline, 'traceMessageStage("auth.permission"', "delivery tracing");
assertIncludes(deliveryPipeline, 'traceMessageStage("subscription.message_access"', "delivery tracing");
assertIncludes(deliveryPipeline, 'traceMessageStage("queue.recipients.enqueue"', "delivery tracing");
assertIncludes(deliveryPipeline, 'traceMessageStage("queue.delivery_readiness"', "delivery readiness tracing");
assertIncludes(deliveryPipeline, "assertMessageDeliveryQueueReady", "delivery queue consumer guard");
assertIncludes(deliveryPipeline, "message.queue.recipient.enqueued", "queue observability");
assertIncludes(deliveryPipeline, "subscriptionAccess.canSendTargets", "shared subscription access");
assertIncludes(deliveryPipeline, "resolveSendableWhatsAppGroups", "shared group resolver");
assertNotMatches(deliveryPipeline, /maxMessagesPerDay|maxMessagesPerMonth|maxGroups|dailyMessageLimit|monthlyMessageLimit/, "delivery pipeline");

assertIncludes(subscriptionAccess, "return { allowed: true, limit: undefined", "message limits disabled");
assertIncludes(subscriptionAccess, "current.entitlements.whatsappConnections", "company WhatsApp connection limit");
assertIncludes(subscriptionAccess, "prisma.whatsAppAccount.count", "company WhatsApp connection usage");
assertIncludes(subscriptionAccess, "PENDING_IDENTITY", "verified-identity trial bootstrap connection");
assertNotMatches(subscriptionAccess, /canSendMessage[\s\S]*maxMessagesPerDay|canSendMessage[\s\S]*maxMessagesPerMonth|canSendMessage[\s\S]*maxGroups/, "subscription send access");
assertNotMatches(subscriptionAccess, /canUseScheduledMessages[\s\S]{0,200}plan\.hasScheduledMessages/, "scheduled feature gate");
assertNotMatches(subscriptionAccess, /canUseRecurringMessages[\s\S]{0,200}plan\.hasRecurringMessages/, "recurring feature gate");

assertIncludes(sendableGroups, "isRecoverableWhatsAppStatus", "sendable group resolver");
assertNotMatches(sendableGroups, /canSend:\s*true[^}]*\}/, "sendable group query hard blocker");
assertIncludes(provider, "groupsOwnershipRepairedCount", "group sync ownership repair telemetry");
assertIncludes(provider, "{ userId: ownerUserId, companyId: account.companyId }", "group sync ownership repair");
assertIncludes(provider, 'throw new Error("WHATSAPP_ACCOUNT_OWNER_MISSING")', "group sync owner guard");
assertIncludes(provider, "whatsapp.qr.fresh_socket_retry_scheduled", "QR mode must replace a closed pairing socket before exposing another QR");
assertIncludes(provider, "scheduleFreshQrRetry", "QR mode must retry transient closes on a clean socket");
assertIncludes(provider, "scheduleQrPostScanRestart", "QR mode must preserve accepted pairing credentials across restartRequired closes");
assertIncludes(provider, "WA_QR_PAIRING_POST_SCAN_RESTART_SCHEDULED", "QR post-scan restart must be observable in production logs");
const qrPostScanRestartBlock = provider.slice(
  provider.indexOf("private async scheduleQrPostScanRestart"),
  provider.indexOf("private async reissuePairingCodeOnFreshSocket"),
);
assertIncludes(qrPostScanRestartBlock, 'this.startSession(accountId, "PAIR_QR")', "QR post-scan restart must reuse the paired auth state without a fresh reset");
assertNotMatches(qrPostScanRestartBlock, /clearTemporaryAuth|clearWhatsAppSession/, "QR post-scan restart must never delete newly accepted pairing credentials");
assertIncludes(provider, "whatsapp.qr.stale_token_rejected", "QR mode must reject database QR tokens that no longer have a live pairing socket");
const qrReceiptBlock = provider.slice(
  provider.indexOf('if (qr && currentMode === "PAIR_QR")'),
  provider.indexOf('} else if (qr)', provider.indexOf('if (qr && currentMode === "PAIR_QR")')),
);
assertNotMatches(qrReceiptBlock, /qrTransientRetries\.delete\(accountId\)/, "receiving another QR must not reset the closed-socket retry budget");
assertIncludes(provider, "whatsapp.pairing.stale_socket_close_ignored", "phone pairing must ignore stale socket closes after a newer code request");
assertIncludes(provider, "whatsapp.pairing.active_code_reused", "phone pairing retries must reuse the active code while its socket is still live");
assertIncludes(provider, "WA_PAIRING_VISIBLE_CODE_INVALIDATED", "phone pairing must invalidate a visible code when its owning socket closes");
assertIncludes(provider, "WA_PAIRING_VISIBLE_CODE_RETRY_REQUIRED", "phone pairing must require an explicit new code instead of rotating one in the background");
assertNotMatches(provider, /preserveUnregisteredPairingAuth/, "phone pairing must never preserve partial auth from a closed socket");
assertIncludes(provider, "Browsers.ubuntu", "phone pairing must use Baileys' canonical WEB_BROWSER identity by default");
assertIncludes(provider, 'WHATSAPP_PAIRING_BROWSER_NAME || "Chrome"', "phone pairing must use a canonical Chrome browser identity by default");
assertIncludes(provider, 'WHATSAPP_PAIRING_BROWSER_OS || "ubuntu"', "phone pairing must default to the Baileys Ubuntu web browser tuple");
assertIncludes(provider, "resolveWhatsAppBrowser", "phone pairing must centralize browser identity resolution");
assertIncludes(provider, "WHATSAPP_COMPANION_PLATFORM_ID", "phone pairing must compute the canonical Baileys companion platform id");
assertIncludes(provider, "companionPlatformDisplay", "phone pairing must log the visible companion platform display");
assertIncludes(provider, "fetchLatestWaWebVersion", "phone pairing must prefer the live WhatsApp Web client revision");
assertIncludes(provider, "fetchCurrentWhatsAppWebVersion", "phone pairing must centralize WhatsApp Web version resolution");
assertIncludes(provider, "forceLive", "fresh pairing sockets must force a live WhatsApp Web version lookup");
assertIncludes(provider, 'source: "wa-web"', "phone pairing must log the live WhatsApp Web version source");
assertIncludes(provider, "waVersionSource", "phone pairing must expose the WhatsApp Web version source in production logs");
assertIncludes(provider, "countryCode: WHATSAPP_PAIRING_COUNTRY_CODE", "phone pairing must send an explicit country code to Baileys");
assertIncludes(provider, "browser: WHATSAPP_BROWSER", "phone pairing must log/audit the Baileys browser identity");
assertIncludes(provider, "async refreshPairingCode", "phone pairing reuse must be decided by the worker that owns the socket");
assertIncludes(provider, "whatsapp.pairing.refresh_requires_explicit_new_code", "phone pairing refresh must never generate a hidden replacement code");
assertIncludes(provider, "whatsapp.pairing.registered_close_reconnect", "phone pairing must reconnect instead of clearing newly registered credentials");
assertIncludes(provider, "WA_PAIRING_REGISTERED_OPEN_WATCHDOG_SCHEDULED", "phone pairing must watch for accepted credentials that never reach connection.open");
assertIncludes(provider, "WA_PAIRING_REGISTERED_OPEN_WATCHDOG_TRIGGERED", "phone pairing must restart a registered socket that stalls before connection.open");
assertIncludes(provider, '"connection.open.pairing.registered_watchdog"', "stalled registered pairing credentials must be persisted before socket restart");
assertIncludes(provider, "whatsapp.pairing.error_visible_code_invalidated", "late phone-pairing errors must invalidate the visible code instead of rotating it");
assertIncludes(pairingFlow, "WA_PAIRING_VISIBLE_CODE_REUSED_WITHOUT_SOCKET_RESET", "repeated API requests must not reset the socket that owns a visible code");
assertIncludes(provider, "preservePairingCode ? \"PAIRING_CODE_READY\"", "phone pairing retries must not hide an active pairing code");
assertIncludes(sessionManager, "snapshotHasRegisteredCredentials", "session snapshots must distinguish partial pairing credentials from registered sessions");
assertIncludes(sessionManager, "registered ? AccountStatus.CONNECTED : AccountStatus.PENDING_PAIRING", "partial pairing credentials must not be stored as connected sessions");
assertIncludes(workerHealth, "whatsAppSession.findUnique", "QR wait must fall back to worker session QR");
assertIncludes(workerHealth, "correlationId?: string", "QR wait must accept request correlation");
assertIncludes(workerHealth, 'action: "WHATSAPP_QR_GENERATED"', "QR wait must verify worker generation audit");
assertIncludes(workerHealth, "auditLog.findFirst", "QR wait must match the worker generation event");
assertIncludes(workerHealth, "QR_CODE_STABILITY_MS", "QR wait must reject immediately replaced QR values");
assertIncludes(provider, "qrRequestCorrelationIds", "QR provider must retain request correlation through socket generation");
assertIncludes(provider, "qrRequestCorrelationIds.get(accountId)", "QR generated audit must carry the active request correlation");
assertIncludes(worker, "createFreshQrSession(accountId, { correlationId })", "QR worker must forward request correlation to the provider");
for (const [label, route] of [
  ["mobile QR route", mobileQrRoute],
  ["web QR route", webQrRoute],
  ["regenerate QR route", regenerateQrRoute],
] as const) {
  assertIncludes(route, "const qrCorrelationId = randomUUID()", `${label} must create a unique QR request correlation`);
  assertIncludes(route, "correlationId: qrCorrelationId", `${label} must enqueue the QR request correlation`);
  assertIncludes(route, "updatedAfter: qrRequestedAt, correlationId: qrCorrelationId", `${label} must wait for only its own fresh QR`);
  assertIncludes(route, "qrCode: null", `${label} must not expose a stale QR while generation is pending`);
}
assertIncludes(accountsStablePage, "/api/accounts/whatsapp/${modal.accountId}/status", "accounts modal must poll the scoped WhatsApp status route");
assertIncludes(accountsStablePage, "src={visibleQr}", "accounts modal must render backend QR image directly");
assertNotMatches(accountsStablePage, /api\.qrserver\.com/, "accounts modal must not send QR data to third-party renderers");
assertIncludes(whatsAppRequestGuards, "async function readyClient", "WhatsApp request guards must wait for Redis before rate-limit commands");
assertIncludes(whatsAppRequestGuards, "const redisClient = await readyClient()", "WhatsApp rate-limit guard must not issue Redis commands before ready");

assertIncludes(worker, 'traceMessageStage("worker.target.resolve"', "worker target tracing");
assertIncludes(worker, 'traceMessageStage("worker.baileys.send"', "worker send tracing");
assertIncludes(worker, "message.target_resolution_failed", "worker must fail missing targets after claiming recipients");
assertIncludes(worker, "isPermanentMessageDeliveryError", "worker must not retry permanent target or ownership failures");
assertIncludes(worker, "updateMessageCampaignDeliveryAggregate", "worker must aggregate delivery state after success and failure");
assertIncludes(worker, "MESSAGE_JOB_TENANT_MISMATCH", "worker tenant protection");
assertIncludes(worker, "MESSAGE_JOB_OWNERSHIP_MISMATCH", "worker user/account ownership protection");
assertIncludes(worker, "message.recurring.group_resolution_failed", "recurring ownership revalidation");
assertIncludes(worker, "WHATSAPP_DELIVERY_RETRIES_EXHAUSTED", "worker bounded retry exhaustion");
assertNotMatches(worker, /recoverable-recipient-\$\{recipient\.id\}-\$\{Date\.now\(\)\}/, "worker unbounded retry fan-out");
assertIncludes(provider, 'throw new Error("WHATSAPP_CREDENTIALS_MISSING")', "missing credentials must require fresh pairing");
assertIncludes(provider, 'throw new Error("WHATSAPP_LOGGED_OUT")', "logged-out accounts must not enter reconnect retry loops");
assertIncludes(worker, 'action === "pairing-refresh"', "worker must support live refresh of reused pairing codes");
assertNotMatches(pairingFlow, /action:\s*"pairing-refresh"/, "repeated API requests must not enqueue a hidden replacement code");
assertNotMatches(pairingFlow, /refreshRequestedAt/, "reused visible codes must not reset or refresh their owning socket");
assertIncludes(pairingFlow, "hasExpiringPairingCode", "pairing flow must not return nearly expired in-flight codes");
assertIncludes(workerHealth, "updatedAfter", "pairing wait must not return pre-refresh stale codes");
assertIncludes(workerHealth, "PAIRING_CODE_MIN_TTL_MS", "pairing wait must require enough remaining pairing code TTL");

assertIncludes(mobileQrRoute, 'status: "CONNECTED"', "mobile QR connected-account reuse");
assertIncludes(mobilePhoneCodeRoute, 'status: "CONNECTED"', "mobile phone-code connected-account reuse");
assertIncludes(platformRoute, "isRecoverableWhatsAppStatus", "web platform group filtering");
assertIncludes(mobileGroupsRoute, "listRecoverableWhatsAppAccounts", "mobile group filtering");
assertIncludes(mobileResponse, "WHATSAPP_WORKER_UNAVAILABLE", "mobile worker-unavailable response");
assertIncludes(mobileApiClient, "whatsappServiceUnavailableError", "mobile worker-unavailable user message");
assertIncludes(worker, "classifyWorkerProcessError", "worker process rejection classification");
assertIncludes(worker, "WORKER_UNHANDLED_REJECTION_ISOLATED", "recoverable worker rejection containment");
assertIncludes(worker, "fatalShutdownRequested", "fatal worker shutdown deduplication");
assertIncludes(worker, "recoverableRejectionAlertAt", "recoverable rejection alert throttling");
assertIncludes(worker, "whatsapp.session.recovery_sweep_paused_active_pairing", "background session recovery must not compete with QR or phone pairing");
assertIncludes(packageManifest, "patch-baileys-disable-offline-batch.mjs", "production install must apply the bounded offline-history policy");
assertIncludes(workerDockerfile, "COPY scripts/patch-baileys-disable-offline-batch.mjs", "worker image must contain the offline-history patch before npm install");
assertIncludes(productionWorkerDockerfile, "COPY scripts/patch-baileys-disable-offline-batch.mjs", "production worker image must contain the offline-history patch before npm install");
assertIncludes(productionWorkerDockerfile, "node scripts/patch-baileys-disable-offline-batch.mjs", "production worker image must apply the offline-history patch");
assertIncludes(offlineBatchPatch, "LOGIVYA_OFFLINE_BATCH_DISABLED", "offline-history patch must remain idempotent");
assertIncludes(offlineBatchPatch, "offline preview ignored by Logivya outbound worker", "patched offline preview handler must not request encrypted history batches");

console.info("message delivery root-cause regression checks passed");

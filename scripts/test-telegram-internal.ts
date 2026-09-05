import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { telegramInternalAccessAllowed, telegramAccessAudience } from "../src/server/telegram/access-policy";
import { decryptTelegramDatabaseKey, encryptTelegramDatabaseKey } from "../src/server/telegram/crypto";
import { maskTelegramPhone, normalizeTelegramPhone } from "../src/server/telegram/phone";
import { telegramAuthStateSnapshot } from "../src/server/telegram/tdlib-client";
import { telegramRunStatus } from "../src/server/telegram/dispatch-worker";
import { renderTelegramDeliveryContent } from "../src/server/telegram/outbound-composer";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

for (const platform of ["ANDROID", "IOS", "WEB"] as const) {
  const normalUser = { platform, internalFlag: { isEnabled: true, rolloutPercentage: 100 }, admin: null };
  assert.equal(telegramAccessAudience({ ...normalUser, publicFlag: { isEnabled: true, rolloutPercentage: 100 } }), "public");
  for (const publicFlag of [undefined, { isEnabled: false, rolloutPercentage: 100 }, { isEnabled: true, rolloutPercentage: 99 }]) {
    assert.equal(telegramAccessAudience({ ...normalUser, publicFlag }), null, "disabled or incomplete rollout denies ordinary users");
  }
  assert.equal(telegramAccessAudience({ ...normalUser, publicFlag: undefined, admin: { isActive: true, permissions: ["telegram_internal_access"] } }), "internal");
  assert.equal(telegramAccessAudience({ ...normalUser, publicFlag: undefined, admin: { isActive: false, permissions: ["telegram_internal_access"] } }), null);
}
assert.equal(telegramAccessAudience({ platform: "UNKNOWN", publicFlag: { isEnabled: true, rolloutPercentage: 100 }, internalFlag: undefined, admin: null }), null);

assert.equal(telegramInternalAccessAllowed({
  platform: "ANDROID",
  flag: { isEnabled: true, rolloutPercentage: 100 },
  admin: { isActive: true, permissions: ["telegram_internal_access"] },
}), true, "authorized Android internal tester must be allowed");

assert.equal(telegramInternalAccessAllowed({
  platform: "IOS",
  flag: { isEnabled: true, rolloutPercentage: 100 },
  admin: { isActive: true, permissions: ["telegram_internal_access"] },
}), true, "authorized iOS internal tester must be allowed");

assert.equal(telegramInternalAccessAllowed({
  platform: "WEB",
  flag: { isEnabled: true, rolloutPercentage: 100 },
  admin: { isActive: true, permissions: ["telegram_internal_access"] },
}), true, "authorized web internal tester must be allowed");

assert.equal(telegramInternalAccessAllowed({
  platform: "UNKNOWN",
  flag: { isEnabled: true, rolloutPercentage: 100 },
  admin: { isActive: true, permissions: ["telegram_internal_access"] },
}), false, "unknown platforms must fail closed");

assert.equal(telegramInternalAccessAllowed({
  platform: "WEB",
  flag: { isEnabled: true, rolloutPercentage: 100 },
  admin: { isActive: true, permissions: [] },
}), false, "web access still requires the explicit Telegram permission");

assert.equal(telegramInternalAccessAllowed({
  platform: "ANDROID",
  flag: { isEnabled: true, rolloutPercentage: 100 },
  admin: { isActive: true, permissions: [] },
}), false, "an admin without the explicit permission must not inherit access");
assert.equal(telegramInternalAccessAllowed({
  platform: "ANDROID",
  flag: { isEnabled: false, rolloutPercentage: 100 },
  admin: { isActive: true, permissions: ["telegram_internal_access"] },
}), false, "disabled feature flag must fail closed");
assert.equal(telegramInternalAccessAllowed({
  platform: "ANDROID",
  flag: { isEnabled: true, rolloutPercentage: 99 },
  admin: { isActive: true, permissions: ["telegram_internal_access"] },
}), false, "internal flag requires an intentional 100 percent enablement");

process.env.TELEGRAM_SESSION_KEY_ACTIVE_VERSION = "v1";
process.env.TELEGRAM_SESSION_KEY_V1 = randomBytes(32).toString("base64url");
const databaseKeyBytes = randomBytes(32);
const databaseKey = databaseKeyBytes.toString("base64url");
const encrypted = encryptTelegramDatabaseKey(databaseKey);
assert.notEqual(encrypted, databaseKey);
assert.ok(!encrypted.includes(databaseKey), "encrypted envelope must not contain plaintext");
assert.equal(decryptTelegramDatabaseKey(encrypted), databaseKeyBytes.toString("base64"), "TDLib bytes must use padded standard base64");

assert.equal(normalizeTelegramPhone("+90 (555) 111-22-33"), "+905551112233");
assert.match(maskTelegramPhone("+905551112233"), /^\+905\*+233$/);
assert.throws(() => normalizeTelegramPhone("0555 111 22 33"), /TELEGRAM_PHONE_INVALID/);

assert.equal(telegramAuthStateSnapshot({ _: "authorizationStateWaitPhoneNumber" }).state, "WAIT_PHONE_NUMBER");
assert.equal(telegramAuthStateSnapshot({ _: "authorizationStateWaitCode", code_info: { _: "authenticationCodeInfo", phone_number: "+90***", type: { _: "authenticationCodeTypeTelegramMessage", length: 5 }, timeout: 60 } }).state, "WAIT_CODE");
assert.equal(telegramAuthStateSnapshot({ _: "authorizationStateWaitPassword", password_hint: "ipucu", has_recovery_email_address: true, has_passport_data: false, recovery_email_address_pattern: "e***@example.com" }).state, "WAIT_PASSWORD");
assert.equal(telegramAuthStateSnapshot({ _: "authorizationStateReady" }).state, "READY");
assert.equal(telegramRunStatus(93, 5, 2), "PROCESSING");
assert.equal(telegramRunStatus(93, 5, 0), "PARTIAL");
assert.equal(telegramRunStatus(0, 5, 0), "FAILED");
assert.equal(telegramRunStatus(100, 0, 0), "SENT");

assert.equal(
  renderTelegramDeliveryContent({
    originalText: "Telegram mesajı",
    companyDefaultLanguage: "tr",
    messageBrandingRequired: true,
  }).content,
  "Telegram mesajı\n\nBu mesaj logivya.com üzerinden gönderilmiştir.",
  "advertising packages must append the canonical Turkish Logivya attribution",
);
assert.equal(
  renderTelegramDeliveryContent({
    originalText: "Telegram mesajı",
    companyDefaultLanguage: "tr",
    messageBrandingRequired: false,
  }).content,
  "Telegram mesajı",
  "ad-free packages must keep Telegram content unbranded",
);

const migration = read("prisma/migrations/20260824234500_telegram_internal_foundation/migration.sql");
assert.match(migration, /'telegram_public'.*false, 0/s);
assert.match(migration, /'telegram_internal'.*true, 100/s);
assert.match(migration, /lower\(u\."email"\) = 'burakidim@gmail\.com'/);
assert.match(migration, /telegram_internal_access/);
assert.match(migration, /"accountType" "TelegramAccountType" NOT NULL DEFAULT 'USER'/);
assert.match(migration, /"timezone" TEXT NOT NULL DEFAULT 'Europe\/Istanbul'/);
assert.match(migration, /"contentJson" JSONB/);
assert.doesNotMatch(migration, /ALTER TABLE "WhatsApp|DROP TABLE|DROP COLUMN/i, "migration must not alter the stable WhatsApp core");

const deleteMigration = read("prisma/migrations/20260825142000_telegram_delete_for_everyone/migration.sql");
assert.match(deleteMigration, /CREATE TYPE "TelegramMessageDeleteStatus"/);
assert.match(deleteMigration, /"deletedForEveryoneAt" TIMESTAMP\(3\)/);
assert.match(deleteMigration, /"deleteStatus" "TelegramMessageDeleteStatus" NOT NULL DEFAULT 'NONE'/);
assert.doesNotMatch(deleteMigration, /WhatsApp|MessageCampaign|MessageRecipient/i, "Telegram deletion migration must not alter the stable WhatsApp core");

const attributionMigration = read("prisma/migrations/20260825154000_telegram_advertising_attribution/migration.sql");
assert.match(attributionMigration, /ALTER TABLE "TelegramDelivery"/);
assert.match(attributionMigration, /"renderedContent" TEXT/);
assert.match(attributionMigration, /"attributionApplied" BOOLEAN/);
assert.match(attributionMigration, /"effectivePlanCode" TEXT/);
assert.doesNotMatch(attributionMigration, /WhatsApp|MessageCampaign|MessageRecipient/i, "Telegram attribution migration must not alter the stable WhatsApp core");

for (const route of [
  "src/app/api/mobile/telegram/accounts/route.ts",
  "src/app/api/mobile/telegram/accounts/[id]/auth/route.ts",
  "src/app/api/mobile/telegram/accounts/[id]/sync/route.ts",
  "src/app/api/mobile/telegram/accounts/[id]/archive/route.ts",
  "src/app/api/mobile/telegram/chats/route.ts",
  "src/app/api/mobile/telegram/categories/[id]/chats/route.ts",
  "src/app/api/mobile/telegram/dispatches/route.ts",
  "src/app/api/mobile/telegram/dispatches/[id]/cancel/route.ts",
  "src/app/api/mobile/telegram/dispatches/[id]/delete-for-everyone/route.ts",
]) {
  assert.match(read(route), /requireTelegramInternalAccess/, `${route} must enforce backend access`);
}

const tdlib = read("src/server/telegram/tdlib-client.ts");
assert.match(tdlib, /getTdjson/);
assert.match(tdlib, /checkAuthenticationCode/);
assert.match(tdlib, /checkAuthenticationPassword/);
assert.match(tdlib, /databaseEncryptionKey/);
assert.match(tdlib, /setNetworkType[\s\S]*networkTypeOther/, "TDLib must be told that the Hetzner worker network is available");
assert.match(tdlib, /updateConnectionState/, "TDLib connection state must be observable in production logs");
assert.match(tdlib, /AUTH_SUBMISSION_ACK_TIMEOUT_MS = 2_000/, "authentication must acknowledge before the 15 second mobile timeout");
assert.match(tdlib, /pendingAuthSubmissions/, "duplicate authentication submissions must reuse the in-flight operation");
assert.match(tdlib, /Promise\.race/, "slow TDLib authentication must continue behind a bounded acknowledgement");
assert.match(tdlib, /getMessageProperties[\s\S]*can_be_deleted_for_all_users/, "Telegram must verify revoke permission before deletion");
assert.match(tdlib, /deleteMessages[\s\S]*revoke: true/, "Telegram deletion must revoke messages for every chat member");
assert.doesNotMatch(tdlib, /bot token|Bot API/i, "implementation must use a user-account client, not Bot API");

const vpsCompose = read("ops/vps/compose.app.yml");
assert.match(
  vpsCompose,
  /telegram-worker:[\s\S]*?networks:\s*\n\s*- backend\s*\n\s*- frontend\s*\n\s*\n\s*notification-worker:/,
  "Telegram worker needs the outbound frontend network as well as the internal backend network",
);

const accountsService = read("src/server/telegram/accounts.ts");
assert.match(accountsService, /where: \{ id, ownerUserId, companyId, archivedAt: null \}/, "account ownership must be checked server-side");
assert.match(accountsService, /WITH lock AS \(SELECT pg_advisory_xact_lock/, "account creation must be serialized per owner");
assert.match(accountsService, /SELECT 1::int AS acquired FROM lock/, "the advisory lock query must return a Prisma-supported type instead of PostgreSQL void");
const dispatchService = read("src/server/telegram/dispatch.ts");
assert.match(dispatchService, /canSend: true, isActive: true, isArchived: false/, "inactive and no-send-permission chats must be rejected");
assert.match(dispatchService, /account\.status !== "CONNECTED" \|\| account\.authState !== "READY"/, "disconnected sessions must not send");
const categoryRoute = read("src/app/api/mobile/telegram/categories/[id]/chats/route.ts");
assert.match(categoryRoute, /account: \{ ownerUserId: user\.id, archivedAt: null \}/, "category assignments must retain chat ownership isolation");

const dispatchWorker = read("src/server/telegram/dispatch-worker.ts");
assert.match(dispatchWorker, /FLOOD_WAIT/);
assert.match(dispatchWorker, /createdById_clientRequestId|occurrenceKey/);
assert.match(dispatchWorker, /hourlyLimit/);
assert.match(dispatchWorker, /dailyLimit/);
assert.match(dispatchWorker, /composeTelegramOutboundMessage/);
assert.match(dispatchWorker, /sendTelegramMessage\(\{[\s\S]*content: partIndex === 0 \? composition\.content : ""/, "Telegram must send the delivery-time composed package-aware content on the first attachment");
assert.match(dispatchWorker, /loadOutboundMessageAttachments/, "Telegram media deliveries must resolve all tenant-owned attachments at delivery time");
assert.match(dispatchWorker, /decodeTelegramExternalMessageIds/, "Telegram media retries must resume after already delivered attachments");
assert.match(dispatchWorker, /renderedContent: composition\.content/, "Telegram retries must persist the stable rendered content");
const telegramOutboundComposer = read("src/server/telegram/outbound-composer.ts");
assert.doesNotMatch(telegramOutboundComposer, /["']server-only["']/, "Telegram attribution composer must remain compatible with the standalone worker runtime");

const deleteService = read("src/server/telegram/delete-for-everyone.ts");
assert.doesNotMatch(deleteService, /["']server-only["']/, "worker-shared Telegram deletion code must not depend on Next.js-only runtime packages");
assert.match(deleteService, /companyId: input\.companyId[\s\S]*createdById: input\.userId/, "Telegram deletion must enforce company and sender ownership in the worker");
assert.match(deleteService, /status: "CANCELED"[\s\S]*deleteRequestedAt/, "recurring dispatches must stop before their sent messages are revoked");
assert.match(deleteService, /deleteStatus: "DELETED"[\s\S]*deletedForEveryoneAt/, "successful revocations must be durably recorded");
assert.match(deleteService, /deleteStatus: "FAILED"[\s\S]*deleteErrorCode/, "failed revocations must remain retryable and observable");
const telegramWorker = read("src/telegram-worker/index.ts");
assert.match(
  read("ops/vps/Dockerfile.telegram"),
  /COPY --chown=logivya:logivya shared \.\/shared/,
  "Production Telegram image must include the shared country registry used by localized attribution",
);
assert.match(telegramWorker, /dispatches\\\/\(\[\^\/\]\+\)\\\/delete-for-everyone/);
assert.match(telegramWorker, /deleteOwnedTelegramDispatchForEveryone/);

const appNavigator = read("apps/mobile/src/navigation/app-navigator.tsx");
assert.match(appNavigator, /telegramEnabled \? <Tab\.Screen name="Telegram"/);
const sidebar = read("apps/mobile/src/components/web-parity-tab-bar.tsx");
assert.match(sidebar, /name: "WhatsApp"[\s\S]*name: "Telegram"/, "Telegram must be directly below WhatsApp");
const telegramScreen = read("apps/mobile/src/screens/app/telegram-screen.tsx");
assert.match(telegramScreen, /StatCard[\s\S]*effectiveSendChatIds/, "Telegram messaging must expose WhatsApp-parity summary metrics and a deduplicated target count");
assert.match(telegramScreen, /DateTimePicker/, "Telegram scheduling must use the native date-time picker instead of a raw ISO input");
assert.match(telegramScreen, /sendCategoryIds[\s\S]*categoryTargetIds/, "Telegram categories must expand into sendable chat targets");
assert.match(telegramScreen, /writeMessage[\s\S]*selectAudiences/, "Telegram compose content must appear before the audience selector like the WhatsApp composer");
assert.match(telegramScreen, /if \(!lockedTab\) setTab\("history"\)/, "the shared Messaging tab must stay on the Telegram composer after a successful send");
assert.match(telegramScreen, /deleteTelegramDispatchForEveryone/, "Telegram history must call the owned revoke endpoint");
assert.match(telegramScreen, /deleteTitle[\s\S]*style: "destructive"/, "Telegram revoke must require a destructive confirmation dialog");
assert.match(telegramScreen, /deleteFailedCount[\s\S]*retryDelete/, "partial Telegram revocations must remain retryable in history");
assert.match(telegramScreen, /getMobileSubscription/, "Telegram composer must load the package branding entitlement");
assert.match(telegramScreen, /brandingNotice/, "advertising package users must see the Telegram attribution notice");
assert.match(telegramScreen, /ADVERTISING_MESSAGE_LIMIT/, "Telegram composer must reserve room for the attribution footer");
const accessStore = read("apps/mobile/src/features/telegram/telegramAccessStore.ts");
assert.doesNotMatch(accessStore, /isPlatformAdmin/, "frontend must not grant access based on admin status");

console.log("Telegram internal integration contract tests passed.");

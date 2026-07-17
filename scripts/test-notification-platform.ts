import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NOTIFICATION_EVENT_REGISTRY, notificationEventDefinition } from "../src/server/notifications/registry";
import {
  isRetryableNotificationError,
  isSafeNotificationDeepLink,
  isValidNotificationAudienceRequest,
  notificationBackoffMs,
  notificationDeliveryAvailableAt,
  notificationFrequencyDecision,
  resolveNotificationChannels,
} from "../src/server/notifications/policy";
import { announcementInputSchema, announcementPreviewHash } from "../src/server/notifications/announcements";
import { renderText, validateTemplateSource } from "../src/server/notifications/template-policy";
import { decryptPushToken, encryptPushToken, isEncryptedPushToken } from "../src/server/notifications/push-token-security";
import { notificationHeartbeatMaxAgeMs, notificationProcessorMode } from "../src/server/notifications/worker-heartbeat";

process.env.AUTH_SECRET ||= "notification-contract-test-secret-that-is-at-least-32-characters";
process.env.TRIAL_IDENTITY_HASH_KEY ||= "notification-contract-hash-secret-at-least-32-characters";

const requiredEvents = [
  "account.welcome", "account.password_changed", "invitation.created", "membership.removed", "trial.started",
  "subscription.activated", "payment.failed", "support.admin_replied", "whatsapp.reconnecting",
  "whatsapp.contact_sync_completed", "message.campaign_completed", "message.delete_for_everyone_completed",
  "system.maintenance_scheduled", "system.incident_created", "backup.completed", "privacy.data_export_ready",
] as const;

for (const event of requiredEvents) assert.ok(NOTIFICATION_EVENT_REGISTRY[event], `missing registry event: ${event}`);
assert.throws(() => notificationEventDefinition("module.arbitrary_event"), /NOTIFICATION_EVENT_TYPE_UNREGISTERED/);
assert.ok(Object.keys(NOTIFICATION_EVENT_REGISTRY).length >= 70, "registry must cover the enterprise taxonomy");

assert.deepEqual(
  resolveNotificationChannels(["IN_APP", "EMAIL"], ["EMAIL"], [{ channel: "IN_APP", enabled: false }, { channel: "EMAIL", enabled: false }]),
  ["EMAIL"],
  "mandatory channel must override user suppression",
);
assert.deepEqual(resolveNotificationChannels(["IN_APP", "EMAIL"], [], [{ channel: "EMAIL", enabled: false }]), ["IN_APP"]);

const now = new Date("2026-07-17T20:30:00.000Z");
const quietResult = notificationDeliveryAvailableAt("EMAIL", [{
  channel: "EMAIL", enabled: true, digestMode: "IMMEDIATE", quietHoursStart: "22:00", quietHoursEnd: "08:00", timezone: "Europe/Istanbul",
}], undefined, now);
assert.ok(quietResult > now, "quiet hours must delay external delivery");
const scheduled = new Date("2026-07-20T10:00:00.000Z");
assert.equal(notificationDeliveryAvailableAt("IN_APP", [], scheduled, now).toISOString(), scheduled.toISOString());

assert.equal(notificationBackoffMs(1), 30_000);
assert.equal(notificationBackoffMs(2), 60_000);
assert.equal(notificationBackoffMs(99), 6 * 60 * 60_000);
assert.equal(isRetryableNotificationError("EMAIL_TEMPLATE_VARIABLES_MISSING"), false);
assert.equal(isRetryableNotificationError("EXPO_PUSH_503"), true);

const recentReconnect = [{
  id: "notification-1",
  type: "whatsapp.reconnecting",
  category: "WHATSAPP" as const,
  collapseKey: "whatsapp-account:1:connection",
  createdAt: new Date("2026-07-17T20:29:30.000Z"),
  updatedAt: new Date("2026-07-17T20:29:30.000Z"),
  lastCollapsedAt: null,
}];
assert.deepEqual(notificationFrequencyDecision({
  type: "whatsapp.reconnecting", category: "WHATSAPP", priority: "NORMAL", collapseKey: "whatsapp-account:1:connection", mandatory: false, recent: recentReconnect, now,
}), { action: "COLLAPSE", notificationId: "notification-1" });
assert.deepEqual(notificationFrequencyDecision({
  type: "security.suspicious_login", category: "SECURITY", priority: "CRITICAL", collapseKey: "security:1", mandatory: false, recent: recentReconnect, now,
}), { action: "DELIVER" }, "critical events must bypass cooldown and rate limits");
const marketingRecords = Array.from({ length: 3 }, (_, index) => ({
  id: `marketing-${index}`, type: `marketing.${index}`, category: "MARKETING" as const, collapseKey: null,
  createdAt: new Date(now.getTime() - (index + 1) * 60_000), updatedAt: new Date(now.getTime() - (index + 1) * 60_000), lastCollapsedAt: null,
}));
assert.deepEqual(notificationFrequencyDecision({
  type: "marketing.new_offer", category: "MARKETING", priority: "LOW", mandatory: false, recent: marketingRecords, now,
}), { action: "RATE_LIMIT" }, "marketing must be capped per user");

assert.equal(isSafeNotificationDeepLink("/support/tickets/123"), true);
assert.equal(isSafeNotificationDeepLink("logivya://support/tickets/123"), true);
assert.equal(isSafeNotificationDeepLink("https://www.logivya.com/dashboard"), true);
assert.equal(isSafeNotificationDeepLink("https://attacker.example/steal"), false);
assert.equal(isSafeNotificationDeepLink("//attacker.example"), false);
assert.equal(isValidNotificationAudienceRequest({ audience: "COMPANY_USERS", companyId: "company-1" }), true);
assert.equal(isValidNotificationAudienceRequest({ audience: "COMPANY_USERS" }), false);
assert.equal(isValidNotificationAudienceRequest({ audience: "USER", userIds: [] }), false);

assert.equal(announcementInputSchema.safeParse({ title: "Bakim", body: "Planli bakim duyurusu", audience: "PLATFORM_ALL_USERS", locale: "tr", channels: ["IN_APP"], priority: "NORMAL", deepLink: "/notifications" }).success, true);
assert.equal(announcementInputSchema.safeParse({ title: "Unsafe", body: "Unsafe URL", audience: "PLATFORM_ALL_USERS", locale: "tr", channels: ["IN_APP"], priority: "NORMAL", deepLink: "https://attacker.example" }).success, false);
const previewInput = { title: "Bakim", body: "Planli bakim", audience: "PLATFORM_ALL_USERS" as const, locale: "tr", channels: ["IN_APP" as const], priority: "NORMAL" as const, startsAt: now };
assert.equal(announcementPreviewHash(previewInput), announcementPreviewHash(previewInput), "announcement approval hash must be deterministic");

assert.deepEqual(validateTemplateSource({ body: "Hello {{user.name}}", requiredVariables: ["user.name"] }), { valid: true, undeclared: [] });
assert.equal(validateTemplateSource({ body: "Hello {{missing}}", requiredVariables: [] }).valid, false);
assert.equal(renderText("Hello {{user.name}}", { user: { name: "Burak" } }), "Hello Burak");

const rawToken = "ExponentPushToken[notification-test-token]";
const encrypted = encryptPushToken(rawToken);
assert.notEqual(encrypted, rawToken);
assert.equal(isEncryptedPushToken(encrypted), true);
assert.equal(decryptPushToken(encrypted), rawToken);
assert.equal(decryptPushToken(rawToken), rawToken, "legacy plaintext tokens must remain readable during migration");
assert.equal(notificationProcessorMode("cron"), "cron");
assert.equal(notificationProcessorMode("WORKER"), "worker");
assert.equal(notificationProcessorMode("unsupported"), "worker");
assert.equal(notificationHeartbeatMaxAgeMs("worker"), 30_000);
assert.equal(notificationHeartbeatMaxAgeMs("cron"), 26 * 60 * 60_000);
assert.equal(notificationHeartbeatMaxAgeMs("cron", "600000"), 600_000);

const root = process.cwd();
const engine = readFileSync(join(root, "src/server/notifications/engine.ts"), "utf8");
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const dispatch = readFileSync(join(root, "src/app/api/admin/notifications/dispatch/route.ts"), "utf8");
const migration = readFileSync(join(root, "prisma/migrations/20260717090000_enterprise_notification_platform/migration.sql"), "utf8");
const mobileAdmin = readFileSync(join(root, "apps/mobile/src/screens/app/admin-notification-operations-screen.tsx"), "utf8");
const webPushWorker = readFileSync(join(root, "public/logivya-notifications-sw.js"), "utf8");
const notificationCron = readFileSync(join(root, "src/app/api/cron/notifications/route.ts"), "utf8");
assert.match(engine, /NOTIFICATION_RECIPIENT_TENANT_MISMATCH/);
assert.match(engine, /notificationAudienceExpansion/);
assert.match(engine, /leaseExpiresAt/);
assert.match(schema, /dedupeKey\s+String\s+@unique/);
assert.match(schema, /idempotencyKey\s+String\s+@unique/);
assert.match(schema, /collapseKey\s+String\?/);
assert.match(migration, /"channels" "NotificationChannel"\[\] NOT NULL/);
assert.match(engine, /notificationFrequencyDecision/);
assert.doesNotMatch(dispatch, /10_000|10000/);
assert.match(mobileAdmin, /previewAdminNotificationAnnouncement/);
assert.match(mobileAdmin, /retryAdminNotificationDeadLetter/);
assert.match(webPushWorker, /self\.addEventListener\("push"/);
assert.match(notificationCron, /writeNotificationWorkerHeartbeat/);
assert.match(notificationCron, /mode: "cron"/);

console.log(`notification platform contracts passed (${Object.keys(NOTIFICATION_EVENT_REGISTRY).length} registered events)`);

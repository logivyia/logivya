import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  canAdminTransitionSupportStatus,
  canUserReplyToSupportStatus,
  canonicalSupportPriority,
  canonicalSupportStatus,
  normalizeSupportCategory,
  statusAfterAdminReply,
  statusAfterUserReply,
  supportCategories,
} from "../src/server/support/constants";

const root = resolve(import.meta.dirname, "..");

async function source(path: string) {
  return readFile(resolve(root, path), "utf8");
}

async function main() {
  for (const category of supportCategories) assert.equal(normalizeSupportCategory(category), category);
  assert.equal(normalizeSupportCategory("whatsapp"), "WHATSAPP_CONNECTION");
  assert.equal(normalizeSupportCategory("messageDelivery"), "MESSAGE_DELIVERY");
  assert.equal(normalizeSupportCategory("unknown-value"), null);

  assert.equal(canonicalSupportStatus("PENDING"), "WAITING_FOR_ADMIN");
  assert.equal(canonicalSupportStatus("ANSWERED"), "WAITING_FOR_USER");
  assert.equal(canonicalSupportPriority("MEDIUM"), "NORMAL");
  assert.equal(statusAfterAdminReply("OPEN"), "WAITING_FOR_USER");
  assert.equal(statusAfterAdminReply("IN_PROGRESS", true), "IN_PROGRESS");
  assert.equal(statusAfterUserReply("RESOLVED"), "WAITING_FOR_ADMIN");
  assert.equal(canUserReplyToSupportStatus("CLOSED"), false);
  assert.equal(canUserReplyToSupportStatus("RESOLVED"), true);
  assert.equal(canAdminTransitionSupportStatus("OPEN", "IN_PROGRESS"), true);
  assert.equal(canAdminTransitionSupportStatus("OPEN", "WAITING_FOR_USER"), true);
  assert.equal(canAdminTransitionSupportStatus("CLOSED", "OPEN"), true);
  assert.equal(canAdminTransitionSupportStatus("CLOSED", "RESOLVED"), false);

  const schema = await source("prisma/schema.prisma");
  assert.match(schema, /@@unique\(\[createdById, clientRequestId\]\)/);
  assert.match(schema, /@@unique\(\[ticketId, clientMessageId\]\)/);
  assert.match(schema, /model SupportTicketAudit/);
  assert.match(schema, /model SupportNotificationOutbox/);
  assert.match(schema, /userUnreadCount\s+Int\s+@default\(0\)/);
  assert.match(schema, /adminUnreadCount\s+Int\s+@default\(0\)/);

  const service = await source("src/server/support/service.ts");
  assert.match(service, /TransactionIsolationLevel\.ReadCommitted/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /SUPPORT_TICKET_OPENED_BY_ADMIN/);
  assert.match(service, /SUPPORT_INTERNAL_NOTE_ADDED/);
  assert.doesNotMatch(service, /server\/whatsapp|worker\/|delivery-pipeline/);

  const adminGuard = await source("src/server/support.ts");
  assert.match(adminGuard, /requirePlatformAdmin/);
  assert.match(adminGuard, /admin\.support\.read/);
  assert.match(adminGuard, /admin\.support\.update/);

  const userRoutes = [
    "src/app/api/support/tickets/route.ts",
    "src/app/api/support/tickets/[id]/route.ts",
    "src/app/api/support/tickets/[id]/messages/route.ts",
    "src/app/api/mobile/support/tickets/route.ts",
    "src/app/api/mobile/support/tickets/[id]/route.ts",
    "src/app/api/mobile/support/tickets/[id]/messages/route.ts",
  ];
  for (const path of userRoutes) assert.match(await source(path), /server\/support\/service/);

  const adminRoutes = [
    "src/app/api/admin/support/tickets/route.ts",
    "src/app/api/admin/support/tickets/[id]/route.ts",
    "src/app/api/admin/support/tickets/[id]/messages/route.ts",
    "src/app/api/admin/support/tickets/[id]/status/route.ts",
    "src/app/api/admin/support/tickets/[id]/priority/route.ts",
  ];
  for (const path of adminRoutes) {
    const content = await source(path);
    assert.match(content, /requireSupportSuperAdmin/);
    assert.match(content, /server\/support\/service/);
  }

  const mobileClient = await source("apps/mobile/src/api/mobileSupport.ts");
  assert.match(mobileClient, /clientMessageId/);
  assert.match(mobileClient, /publicId/);
  const webClient = await source("src/components/support-stable-page.tsx");
  assert.match(webClient, /crypto\.randomUUID/);
  assert.match(webClient, /publicId/);

  console.log(JSON.stringify({
    ok: true,
    categories: supportCategories.length,
    statusStateMachine: true,
    backendGuard: true,
    idempotencyConstraints: true,
    unreadState: true,
    auditAndOutbox: true,
    sharedServiceRoutes: userRoutes.length + adminRoutes.length,
    stableWhatsAppCoreImports: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

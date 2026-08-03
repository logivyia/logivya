import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(path: string, expected: string) {
  const content = read(path);
  if (!content.includes(expected)) {
    throw new Error(`${path} does not include ${expected}`);
  }
}

function assertExists(path: string) {
  if (!existsSync(join(root, path))) {
    throw new Error(`${path} does not exist`);
  }
}

function main() {
  assertIncludes("prisma/schema.prisma", "enum CampaignDeleteForEveryoneStatus");
  assertIncludes("prisma/schema.prisma", "enum DeleteForEveryoneStatus");
  assertIncludes("prisma/schema.prisma", "messageKeyJson");
  assertIncludes("prisma/schema.prisma", "UserMessageVisibility");
  assertExists("prisma/migrations/20260701012000_delete_for_everyone_revoke/migration.sql");

  assertIncludes("src/server/whatsapp/provider.ts", "deleteGroupMessage(input: DeleteGroupMessageInput): Promise<DeleteResult>");
  assertIncludes("src/worker/baileys-provider.ts", "return { externalMessageId: result.key.id, messageKey: result.key }");
  assertIncludes("src/worker/baileys-provider.ts", "async deleteGroupMessage(input: DeleteGroupMessageInput): Promise<DeleteResult>");
  assertIncludes("src/worker/baileys-provider.ts", "socket.sendMessage(input.groupExternalId, { delete: deleteKey })");

  assertIncludes("src/server/queues/contracts.ts", "export type DeleteForEveryoneJob");
  assertIncludes("src/server/messages/delete-for-everyone.ts", "WHATSAPP_DELETE_FOR_EVERYONE_WINDOW_MS");
  assertIncludes("src/server/messages/delete-for-everyone.ts", "queue.add(\"delete-for-everyone\"");
  assertIncludes("src/server/messages/delete-for-everyone.ts", "createdById: input.userId");
  assertIncludes("src/server/messages/delete-for-everyone.ts", "recipient.account.userId !== input.userId");
  assertIncludes("src/server/messages/delete-for-everyone.ts", "recipient.group?.userId !== input.userId");
  assertIncludes("src/worker/index.ts", "job.name === \"delete-for-everyone\"");
  assertIncludes("src/worker/index.ts", "withWhatsAppAccountLock");
  assertIncludes("src/worker/index.ts", "message-delete-for-everyone");
  assertIncludes("src/worker/index.ts", "provider.deleteGroupMessage");
  assertIncludes("src/worker/index.ts", "recipient.campaign.createdById !== jobData.userId");
  assertIncludes("src/worker/index.ts", "recipient.account.userId !== jobData.userId");

  assertExists("src/app/api/messages/campaigns/[id]/delete-everyone/route.ts");
  assertExists("src/app/api/messages/campaigns/[id]/delete-for-me/route.ts");
  assertExists("src/app/api/messages/campaigns/[id]/platform-delete/route.ts");
  assertExists("src/app/api/messages/campaigns/[id]/delete-status/route.ts");
  assertExists("src/app/api/mobile/messages/history/[id]/delete-for-everyone/route.ts");
  assertExists("src/app/api/mobile/messages/history/[id]/delete-for-me/route.ts");
  assertExists("src/app/api/mobile/messages/history/[id]/platform-delete/route.ts");
  assertIncludes("src/app/api/messages/campaigns/[id]/delete-everyone/route.ts", 'requirePermission(membership.role, "send_messages")');
  assertIncludes("src/app/api/mobile/messages/history/[id]/delete-for-everyone/route.ts", 'requirePermission(membership.role, "send_messages")');

  assertIncludes("src/components/message-history-stable-page.tsx", "history.deleteForMe");
  assertIncludes("src/components/message-history-stable-page.tsx", "history.deleteEveryone");
  assertIncludes("src/components/message-history-stable-page.tsx", "history.platformDelete");
  assertIncludes("apps/mobile/src/screens/app/message-history-screen.tsx", 'label={t("deleteForMe")}');
  assertIncludes("apps/mobile/src/screens/app/message-history-screen.tsx", 'label={t("deleteForEveryone")}');
  assertIncludes("apps/mobile/src/screens/app/message-history-screen.tsx", 'label={t("deleteFromPlatform")}');

  if (existsSync(join(root, "src/lib/whatsapp/delete-message.ts"))) {
    throw new Error("Legacy fake WhatsApp delete helper still exists");
  }

  console.log("delete-for-everyone regression checks passed");
}

main();

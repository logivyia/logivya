import { Prisma } from "@prisma/client";
import { requirePermission } from "@/server/auth/permissions";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { messageQueue } from "@/server/queues/client";
import { resolveSendableWhatsAppGroups } from "@/server/whatsapp/sendable-groups";
import { writeAuditLog } from "@/server/security/audit";
import type { MobileAuthContext } from "@/server/mobile/auth";

export async function createMobileMessageCampaign(request: Request, context: MobileAuthContext, input: {
  title: string;
  content: string;
  groupIds: string[];
  categoryIds: string[];
  scheduledAt?: Date;
}) {
  requirePermission(context.membership.role, input.scheduledAt ? "schedule_messages" : "send_messages");
  const categoryGroups = input.categoryIds.length
    ? await prisma.categoryGroup.findMany({ where: { categoryId: { in: input.categoryIds }, category: { companyId: context.company.id, archivedAt: null } }, select: { groupId: true } })
    : [];
  const requestedIds = [...new Set([...input.groupIds, ...categoryGroups.map((item) => item.groupId)])];
  const groups = await resolveSendableWhatsAppGroups(context.company.id, requestedIds);
  if (!groups.length) throw new Error("NO_SENDABLE_GROUPS");
  const access = await subscriptionAccess.canSendMessage(context.company.id, groups.length);
  if (!access.allowed) throw new Error("SUBSCRIPTION_LOCKED");
  if (input.scheduledAt && !(await subscriptionAccess.canUseScheduledMessages(context.company.id))) throw new Error("SUBSCRIPTION_LOCKED");
  const campaign = await prisma.messageCampaign.create({
    data: {
      companyId: context.company.id,
      createdById: context.user.id,
      title: input.title,
      content: input.content,
      type: "WHATSAPP_GROUP",
      status: "QUEUED",
      scheduleType: input.scheduledAt ? "SCHEDULED" : "SEND_NOW",
      scheduledAt: input.scheduledAt,
      totalRecipients: groups.length,
      contentJson: { source: "mobile" } as Prisma.InputJsonValue,
      recipients: {
        create: groups.map((group) => ({ accountId: group.accountId, groupId: group.id, recipientName: group.name, recipientExternalId: group.externalGroupId })),
      },
    },
    include: { recipients: true },
  });
  const baseDelay = input.scheduledAt ? Math.max(0, input.scheduledAt.getTime() - Date.now()) : 0;
  const queue = messageQueue();
  for (const [index, recipient] of campaign.recipients.entries()) {
    await queue.add("send-recipient", { companyId: context.company.id, campaignId: campaign.id, recipientId: recipient.id }, {
      jobId: `mobile-recipient-${recipient.id}`,
      delay: baseDelay + index * Number(process.env.WHATSAPP_MIN_DELAY_MS || 3000),
      ...(input.scheduledAt ? { attempts: 288, backoff: { type: "fixed", delay: 5 * 60_000 } } : {}),
    });
  }
  await writeAuditLog(request, { companyId: context.company.id, userId: context.user.id, action: input.scheduledAt ? "mobile.message.scheduled" : "mobile.message.sent", entityType: "MessageCampaign", entityId: campaign.id, after: { totalRecipients: groups.length } });
  return campaign;
}

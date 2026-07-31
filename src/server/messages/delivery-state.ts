import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";

const ACTIVE_CAMPAIGN_STATUSES = new Set(["QUEUED", "SENDING"]);

function countStatus(counts: Array<{ status: string; _count: { _all: number } }>, status: string) {
  return counts.find((item) => item.status === status)?._count._all ?? 0;
}

export async function updateMessageCampaignDeliveryAggregate(
  campaignId: string,
  context: { correlationId?: string; workerId?: string } = {},
) {
  const campaign = await prisma.messageCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, companyId: true, createdById: true, title: true, status: true, totalRecipients: true },
  });
  if (!campaign) return null;

  const counts = await prisma.messageRecipient.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const pending =
    countStatus(counts, "PENDING") +
    countStatus(counts, "QUEUED") +
    countStatus(counts, "PROCESSING") +
    countStatus(counts, "SENDING") +
    countStatus(counts, "RETRYING");
  const sent = countStatus(counts, "SENT") + countStatus(counts, "DELIVERED");
  const failed = countStatus(counts, "FAILED");
  const canceled = countStatus(counts, "CANCELED") + countStatus(counts, "SKIPPED");
  const nextStatus = !ACTIVE_CAMPAIGN_STATUSES.has(campaign.status)
    ? campaign.status
    : pending
      ? "SENDING"
      : failed
        ? sent
          ? "PARTIALLY_COMPLETED"
          : "FAILED"
        : canceled && !sent
          ? "CANCELED"
          : "COMPLETED";

  const updated = await prisma.messageCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount: sent,
      failedCount: failed,
      canceledCount: canceled,
      status: nextStatus,
    },
    select: { id: true, companyId: true, createdById: true, title: true, status: true, sentCount: true, failedCount: true, totalRecipients: true },
  });
  logger.info("message.campaign.aggregate_updated", {
    ...context,
    campaignId,
    previousStatus: campaign.status,
    nextStatus,
    sent,
    failed,
    canceled,
    pending,
    totalRecipients: campaign.totalRecipients,
  });
  return { campaign: updated, previousStatus: campaign.status, nextStatus, pending, sent, failed, canceled };
}

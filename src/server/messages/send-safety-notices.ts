import { prisma } from "@/server/db";

export async function campaignSendSafetyNotices(companyId: string, userId: string, campaignIds: string[]) {
  if (!campaignIds.length) return new Map<string, string>();
  const rows = await prisma.messageRecipient.findMany({
    where: {
      campaignId: { in: campaignIds },
      campaign: { companyId, createdById: userId },
      status: "FAILED",
      errorMessage: { in: ["WHATSAPP_SEND_PAUSED", "WHATSAPP_SEND_SAFETY_UNAVAILABLE"] },
    },
    select: { campaignId: true, errorMessage: true },
    distinct: ["campaignId", "errorMessage"],
  });
  return new Map(rows.map((row) => [row.campaignId, row.errorMessage!]));
}

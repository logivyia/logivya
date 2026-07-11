import { createMessageDeliveryCampaign } from "@/server/messages/delivery-pipeline";
import type { MobileAuthContext } from "@/server/mobile/auth";
import { createNotification, NOTIFICATION_TYPES } from "@/server/notifications/service";
import type { RecurringRule } from "@/server/queues/recurring";

export async function createMobileMessageCampaign(
  request: Request,
  context: MobileAuthContext,
  input: {
    title: string;
    content: string;
    groupIds: string[];
    categoryIds: string[];
    contactIds: string[];
    scheduleType?: "SEND_NOW" | "SCHEDULED" | "RECURRING";
    scheduledAt?: Date;
    recurringRule?: RecurringRule;
  },
) {
  const scheduleType = input.scheduleType ?? (input.scheduledAt ? "SCHEDULED" : "SEND_NOW");
  const result = await createMessageDeliveryCampaign(
    request,
    {
      companyId: context.company.id,
      userId: context.user.id,
      role: context.membership.role,
    },
    {
      ...input,
      scheduleType,
      source: "mobile",
    },
  );

  if (scheduleType === "SCHEDULED" && input.scheduledAt) {
    await createNotification({
      companyId: context.company.id,
      userId: context.user.id,
      type: NOTIFICATION_TYPES.CAMPAIGN_SCHEDULED_STARTED,
      title: "Kampanya zamanlandi",
      message: `${result.campaign.title} kampanyasi planlanan zamanda gonderilmek uzere siraya alindi.`,
      payload: {
        campaignId: result.campaign.id,
        scheduledAt: input.scheduledAt.toISOString(),
        totalRecipients: result.campaign.totalRecipients,
        correlationId: result.correlationId,
      },
    });
  }

  if (scheduleType === "RECURRING") {
    await createNotification({
      companyId: context.company.id,
      userId: context.user.id,
      type: NOTIFICATION_TYPES.CAMPAIGN_SCHEDULED_STARTED,
      title: "Tekrarlayan kampanya hazir",
      message: `${result.campaign.title} kampanyasi tekrarli gonderim icin siraya alindi.`,
      payload: {
        campaignId: result.campaign.id,
        recurringRule: input.recurringRule,
        totalRecipients: result.campaign.totalRecipients,
        correlationId: result.correlationId,
      },
    });
  }

  return result;
}

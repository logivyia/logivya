import { z } from "zod";
import { isSmartScheduleDateError, parseSmartScheduleDateTime } from "@/lib/smart-schedule-date";
import { isMessageDeliveryError } from "@/server/messages/delivery-pipeline";
import { requireMobileAuth } from "@/server/mobile/auth";
import { createMobileMessageCampaign } from "@/server/mobile/messages";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

const scheduledAtSchema = z.union([z.string(), z.date()]).nullable().optional();

const schema = z.object({
  title: z.string().min(1).max(120).default("Zamanlı mobil mesaj"),
  content: z.string().min(1).max(4096),
  groupIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  contactIds: z.array(z.string()).default([]),
  targets: z.array(z.object({ type: z.enum(["GROUP", "CONTACT"]), id: z.string().min(1) })).default([]),
  scheduledAt: scheduledAtSchema,
  scheduledTimeZone: z.string().max(80).optional(),
  timeZone: z.string().max(80).optional(),
}).refine((input) => input.groupIds.length || input.categoryIds.length || input.contactIds.length || input.targets.length, { path: ["groupIds"], message: "validation.required" });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { scheduledAt: rawScheduledAt, scheduledTimeZone, timeZone, targets, ...messageInput } = parsed.data;
    const groupIds = [...new Set([...messageInput.groupIds, ...targets.filter((target) => target.type === "GROUP").map((target) => target.id)])];
    const contactIds = [...new Set([...messageInput.contactIds, ...targets.filter((target) => target.type === "CONTACT").map((target) => target.id)])];
    let scheduledAt: Date;
    try {
      scheduledAt = parseSmartScheduleDateTime(rawScheduledAt, { timeZone: context.user.timezone ?? context.company.defaultTimezone ?? scheduledTimeZone ?? timeZone }).date;
    } catch (error) {
      if (isSmartScheduleDateError(error)) return mobileError(error.code, error.userMessage, { status: 400 });
      throw error;
    }
    const { campaign, correlationId } = await createMobileMessageCampaign(request, context, { ...messageInput, groupIds, contactIds, scheduledAt });
    return mobileSuccess(
      { campaign: { id: campaign.id, status: campaign.status, totalRecipients: campaign.totalRecipients, scheduledAt: campaign.scheduledAt }, correlationId },
      { status: 201, meta: { correlationId } }
    );
  } catch (error) {
    if (isMessageDeliveryError(error)) {
      return mobileError(error.code, error.userMessage, { status: error.status, details: { ...(error.details ?? {}), correlationId: error.correlationId } });
    }
    if (error instanceof Error && error.message === "NO_SENDABLE_GROUPS") {
      return mobileError("NO_SENDABLE_GROUPS", "Gönderilebilir bağlı WhatsApp grubu bulunamadı.", { status: 400 });
    }
    return mobileSafeError(error, "Zamanlı mesaj oluşturulamadı.");
  }
}

import { z } from "zod";
import { isSmartScheduleDateError, parseSmartScheduleDateTime } from "@/lib/smart-schedule-date";
import { isMessageDeliveryError } from "@/server/messages/delivery-pipeline";
import { requireMobileAuth } from "@/server/mobile/auth";
import { createMobileMessageCampaign } from "@/server/mobile/messages";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const scheduledAtSchema = z.union([z.string(), z.date()]).nullable().optional();

const schema = z.object({
  title: z.string().min(1).max(120).default("Mobil mesaj"),
  content: z.string().min(1).max(4096),
  groupIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  contactIds: z.array(z.string()).default([]),
  targets: z.array(z.object({ type: z.enum(["GROUP", "CONTACT"]), id: z.string().min(1) })).default([]),
  scheduleType: z.enum(["SEND_NOW", "SCHEDULED", "RECURRING"]).default("SEND_NOW"),
  scheduledAt: scheduledAtSchema,
  scheduledTimeZone: z.string().max(80).optional(),
  timeZone: z.string().max(80).optional(),
  recurringRule: z.object({
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    interval: z.coerce.number().int().min(1).max(365).default(1),
  }).optional(),
}).superRefine((input, ctx) => {
  if (!input.groupIds.length && !input.categoryIds.length && !input.contactIds.length && !input.targets.length) {
    ctx.addIssue({ code: "custom", path: ["groupIds"], message: "validation.required" });
  }
  if (input.scheduleType === "RECURRING" && !input.recurringRule) {
    ctx.addIssue({ code: "custom", path: ["recurringRule"], message: "validation.required" });
  }
});

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    await enforceOperationRateLimit({
      scope: "message.campaign.create",
      subject: `${context.company.id}:${context.user.id}`,
      maxAttempts: 120,
      windowMs: 60_000,
      request,
    });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { scheduledAt: rawScheduledAt, scheduledTimeZone, timeZone, targets, ...messageInput } = parsed.data;
    const groupIds = [...new Set([...messageInput.groupIds, ...targets.filter((target) => target.type === "GROUP").map((target) => target.id)])];
    const contactIds = [...new Set([...messageInput.contactIds, ...targets.filter((target) => target.type === "CONTACT").map((target) => target.id)])];
    let scheduledAt: Date | undefined;
    if (messageInput.scheduleType === "SCHEDULED") {
      try {
        scheduledAt = parseSmartScheduleDateTime(rawScheduledAt, { timeZone: context.user.timezone ?? context.company.defaultTimezone ?? scheduledTimeZone ?? timeZone }).date;
      } catch (error) {
        if (isSmartScheduleDateError(error)) return mobileError(error.code, error.userMessage, { status: 400 });
        throw error;
      }
    }
    const { campaign, correlationId } = await createMobileMessageCampaign(request, context, { ...messageInput, groupIds, contactIds, scheduledAt });
    return mobileSuccess(
      { campaign: { id: campaign.id, status: campaign.status, totalRecipients: campaign.totalRecipients }, correlationId },
      { status: 201, meta: { correlationId } },
    );
  } catch (error) {
    if (isMessageDeliveryError(error)) {
      return mobileError(error.code, error.userMessage, { status: error.status, details: { ...(error.details ?? {}), correlationId: error.correlationId } });
    }
    if (error instanceof Error && error.message === "NO_SENDABLE_GROUPS") {
      return mobileError("NO_SENDABLE_GROUPS", "Gönderilebilir bağlı WhatsApp grubu bulunamadı.", { status: 400 });
    }
    return mobileSafeError(error, "Mesaj gönderilemedi.");
  }
}

import { z } from "zod";
import { isMessageDeliveryError } from "@/server/messages/delivery-pipeline";
import { requireMobileAuth } from "@/server/mobile/auth";
import { createMobileMessageCampaign } from "@/server/mobile/messages";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

const schema = z.object({
  title: z.string().min(1).max(120).default("Zamanlı mobil mesaj"),
  content: z.string().min(1).max(4096),
  groupIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  scheduledAt: z.coerce.date(),
}).refine((input) => input.groupIds.length || input.categoryIds.length, { path: ["groupIds"], message: "validation.required" });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    if (parsed.data.scheduledAt.getTime() <= Date.now()) {
      return mobileError("SCHEDULE_IN_PAST", "Gönderim zamanı gelecekte olmalıdır.", { status: 400 });
    }
    const { campaign, correlationId } = await createMobileMessageCampaign(request, context, parsed.data);
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

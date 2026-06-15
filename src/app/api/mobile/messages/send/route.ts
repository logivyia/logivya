import { z } from "zod";
import { requireMobileAuth } from "@/server/mobile/auth";
import { createMobileMessageCampaign } from "@/server/mobile/messages";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

const schema = z.object({
  title: z.string().min(1).max(120).default("Mobil mesaj"),
  content: z.string().min(1).max(4096),
  groupIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
}).refine((input) => input.groupIds.length || input.categoryIds.length, { path: ["groupIds"], message: "validation.required" });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const context = await requireMobileAuth(request);
    const campaign = await createMobileMessageCampaign(request, context, parsed.data);
    return mobileSuccess({ campaign: { id: campaign.id, status: campaign.status, totalRecipients: campaign.totalRecipients } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_SENDABLE_GROUPS") return mobileError("NO_SENDABLE_GROUPS", "Gönderilebilir bağlı WhatsApp grubu bulunamadı.", { status: 400 });
    return mobileSafeError(error, "Mesaj gönderilemedi.");
  }
}

import { z } from "zod";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { addUserSupportMessage } from "@/server/support/service";
import { supportErrorFromUnknown } from "@/server/support/errors";
import { scheduleSupportNotificationDelivery } from "@/server/support/notifications";

const schema = z.object({
  message: z.string().optional(),
  body: z.string().optional(),
  clientMessageId: z.string().optional(),
  attachmentUrl: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireMobileAuth(request);
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const result = await addUserSupportMessage({
      actor: context,
      identifier: id,
      reply: {
        body: parsed.data.body || parsed.data.message || "",
        clientMessageId: parsed.data.clientMessageId,
        attachmentUrl: parsed.data.attachmentUrl,
      },
      request,
    });
    scheduleSupportNotificationDelivery();
    return mobileSuccess(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const resolved = supportErrorFromUnknown(error, "SUPPORT_REPLY_FAILED");
    return mobileError(resolved.code, "support.error.replyFailed", { status: resolved.status, details: resolved.details });
  }
}

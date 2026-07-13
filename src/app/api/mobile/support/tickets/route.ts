import { z } from "zod";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { createSupportTicket, listUserSupportTickets } from "@/server/support/service";
import { supportErrorFromUnknown } from "@/server/support/errors";
import { scheduleSupportNotificationDelivery } from "@/server/support/notifications";

const createSchema = z.object({
  subject: z.string(),
  category: z.string().optional(),
  type: z.string().optional(),
  message: z.string().optional(),
  body: z.string().optional(),
  description: z.string().optional(),
  clientMessageId: z.string().optional(),
  clientRequestId: z.string().optional(),
  attachmentUrl: z.string().optional(),
});

async function supportFailure(error: unknown, fallback: string) {
  const resolved = supportErrorFromUnknown(error, "SUPPORT_REQUEST_FAILED");
  return mobileError(resolved.code, fallback, { status: resolved.status, details: resolved.details });
}

export async function GET(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const params = new URL(request.url).searchParams;
    const result = await listUserSupportTickets(context, {
      cursor: params.get("cursor"),
      limit: Number(params.get("limit") || 20),
      status: params.get("status"),
      category: params.get("category"),
      search: params.get("search") || params.get("q"),
    });
    return mobileSuccess(result);
  } catch (error) {
    return supportFailure(error, "support.error.loadFailed");
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const result = await createSupportTicket({
      actor: context,
      subject: parsed.data.subject,
      category: parsed.data.category || parsed.data.type || "",
      message: parsed.data.message || parsed.data.body || parsed.data.description || "",
      source: "MOBILE",
      clientMessageId: parsed.data.clientMessageId,
      clientRequestId: parsed.data.clientRequestId,
      attachmentUrl: parsed.data.attachmentUrl,
      request,
    });
    scheduleSupportNotificationDelivery();
    return mobileSuccess(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return supportFailure(error, "support.createFailed");
  }
}

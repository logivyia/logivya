import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSuccess } from "@/server/mobile/response";
import { getUserSupportTicketDetail } from "@/server/support/service";
import { supportErrorFromUnknown } from "@/server/support/errors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireMobileAuth(request);
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const result = await getUserSupportTicketDetail(context, id, {
      cursor: query.get("cursor"),
      limit: Number(query.get("limit") || 50),
      markRead: true,
    });
    return mobileSuccess(result);
  } catch (error) {
    const resolved = supportErrorFromUnknown(error, "SUPPORT_DETAIL_FAILED");
    return mobileError(resolved.code, "support.error.loadFailed", { status: resolved.status, details: resolved.details });
  }
}

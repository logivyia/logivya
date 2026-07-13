import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { getUserSupportTicketDetail } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiSession();
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const result = await getUserSupportTicketDetail(context, id, {
      cursor: query.get("cursor"),
      limit: Number(query.get("limit") || 50),
      markRead: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_DETAIL_FAILED");
  }
}

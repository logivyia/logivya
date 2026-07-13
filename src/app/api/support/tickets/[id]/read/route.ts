import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { getUserSupportTicketDetail } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiSession();
    const { id } = await params;
    const result = await getUserSupportTicketDetail(context, id, { limit: 1, markRead: true });
    return NextResponse.json({ ok: true, ticket: result.ticket });
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_READ_UPDATE_FAILED");
  }
}

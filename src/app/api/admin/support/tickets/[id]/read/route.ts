import { NextResponse } from "next/server";
import { requireSupportSuperAdmin } from "@/server/support";
import { getAdminSupportTicketDetail } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireSupportSuperAdmin(request, "update");
    const { id } = await params;
    const result = await getAdminSupportTicketDetail(context, id, { limit: 1, markRead: true });
    return NextResponse.json({ ok: true, ticket: result.ticket });
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_ADMIN_READ_UPDATE_FAILED");
  }
}

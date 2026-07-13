import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { closeOwnedSupportTicket } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiSession();
    const { id } = await params;
    const result = await closeOwnedSupportTicket({ actor: context, identifier: id, request });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_CLOSE_FAILED");
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSupportSuperAdmin } from "@/server/support";
import { assignAdminSupportTicket } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";

const schema = z.object({ assignedAdminUserId: z.string().nullable().optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireSupportSuperAdmin(request, "update");
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "SUPPORT_VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    return NextResponse.json(await assignAdminSupportTicket({
      actor: context,
      identifier: id,
      assignedAdminUserId: parsed.data.assignedAdminUserId,
      request,
    }));
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_ASSIGNMENT_UPDATE_FAILED");
  }
}

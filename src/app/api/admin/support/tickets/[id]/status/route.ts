import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminWritableSupportTicketStatuses,
  requireSupportSuperAdmin,
} from "@/server/support";
import { changeAdminSupportStatus } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";
import { scheduleSupportNotificationDelivery } from "@/server/support/notifications";

const schema = z.object({
  status: z.enum(adminWritableSupportTicketStatuses),
  reason: z.string().trim().min(3).max(500).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireSupportSuperAdmin(request, "update");
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        {
          error: "SUPPORT_VALIDATION_ERROR",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    const result = await changeAdminSupportStatus({
      actor: context,
      identifier: id,
      status: parsed.data.status,
      reason: parsed.data.reason,
      request,
    });
    scheduleSupportNotificationDelivery();
    return NextResponse.json(result);
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_STATUS_UPDATE_FAILED");
  }
}

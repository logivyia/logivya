import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSupportSuperAdmin, supportPriorities } from "@/server/support";
import { changeAdminSupportPriority } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";

const schema = z.object({ priority: z.enum(supportPriorities) });

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
    return NextResponse.json(
      await changeAdminSupportPriority({
        actor: context,
        identifier: id,
        priority: parsed.data.priority,
        request,
      }),
    );
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_PRIORITY_UPDATE_FAILED");
  }
}

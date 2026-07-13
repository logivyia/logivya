import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSupportSuperAdmin } from "@/server/support";
import {
  addAdminSupportMessage,
  changeAdminSupportPriority,
  changeAdminSupportStatus,
  getAdminSupportTicketDetail,
} from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";
import { scheduleSupportNotificationDelivery } from "@/server/support/notifications";

const updateSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  message: z.string().optional(),
  body: z.string().optional(),
  clientMessageId: z.string().optional(),
  attachmentUrl: z.string().optional(),
  internalNote: z.boolean().optional(),
  reason: z.string().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireSupportSuperAdmin(request);
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const result = await getAdminSupportTicketDetail(context, id, {
      cursor: query.get("cursor"),
      limit: Number(query.get("limit") || 50),
      markRead: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_ADMIN_DETAIL_FAILED");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireSupportSuperAdmin(request, "update");
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "SUPPORT_VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    let ticket: unknown = null;
    let changed = false;
    const body = parsed.data.body || parsed.data.message;
    if (body) {
      const result = await addAdminSupportMessage({
        actor: context,
        identifier: id,
        reply: {
          body,
          clientMessageId: parsed.data.clientMessageId,
          attachmentUrl: parsed.data.attachmentUrl,
          internalNote: parsed.data.internalNote,
        },
        request,
      });
      ticket = result.ticket;
      changed = true;
    }
    if (parsed.data.priority) {
      const result = await changeAdminSupportPriority({ actor: context, identifier: id, priority: parsed.data.priority, request });
      ticket = result.ticket;
      changed = true;
    }
    if (parsed.data.status) {
      const result = await changeAdminSupportStatus({
        actor: context,
        identifier: id,
        status: parsed.data.status,
        reason: parsed.data.reason,
        request,
      });
      ticket = result.ticket;
      changed = true;
    }
    if (!changed) return NextResponse.json({ error: "SUPPORT_VALIDATION_ERROR" }, { status: 400 });
    scheduleSupportNotificationDelivery();
    return NextResponse.json({ ok: true, ticket });
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_ADMIN_UPDATE_FAILED");
  }
}

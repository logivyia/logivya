import { SupportTicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { adminWritableSupportTicketStatuses, requireSupportSuperAdmin } from "@/server/support";

const schema = z.object({
  status: z.enum(adminWritableSupportTicketStatuses),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireSupportSuperAdmin(request);
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "validation.invalid", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });
    if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const status = parsed.data.status as SupportTicketStatus;
    const updated = await prisma.supportTicket.update({
      where: { id },
      data: {
        status,
        assignedToAdminId: user.id,
        closedAt: status === "CLOSED" ? new Date() : null,
      },
      select: { id: true, status: true, closedAt: true, updatedAt: true },
    });

    await writeAuditLog(request, {
      companyId: ticket.companyId,
      userId: user.id,
      action: "support.ticket.status_changed",
      entityType: "SupportTicket",
      entityId: id,
      after: { status },
    });

    return NextResponse.json({ ticket: updated });
  } catch (error) {
    console.error("admin.support.status_update_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}

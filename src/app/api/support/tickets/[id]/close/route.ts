import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { supportTicketOwnerWhere } from "@/server/support";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiSession();
    const { company, user } = context;
    const { id } = await params;
    const result = await prisma.supportTicket.updateMany({
      where: { id, ...supportTicketOwnerWhere(context) },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    if (!result.count) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "support.ticket.closed",
      entityType: "SupportTicket",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
